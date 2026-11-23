"""GTA6 Save Editor 本地服务：http://127.0.0.1:46606  —— UI 只跟这里的 /api 说话。接口说明见 docs/API.md。"""
import json, os, sys, subprocess, threading, time, shutil, struct, zipfile, sqlite3, mimetypes, re, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import money, garlic

FROZEN = getattr(sys, 'frozen', False)
ROOT = Path(getattr(sys, '_MEIPASS', None) or Path(__file__).resolve().parent.parent)
VENDOR, UI = ROOT / 'vendor', ROOT / 'ui'
MAC = sys.platform == 'darwin'
# 打包后程序目录只读，运行数据放到用户目录
APP_SUPPORT = Path.home() / 'Library' / 'Application Support' if MAC else Path(os.environ.get('LOCALAPPDATA', str(Path.home())))
DATA = APP_SUPPORT / 'GTA6SaveEditor' if FROZEN else ROOT / 'data'
# GarlicTransfer（Electron）的用户数据目录
GT_DIR = Path.home() / 'Library' / 'Application Support' / 'garlic-transfer' if MAC else Path(os.environ.get('APPDATA', '')) / 'garlic-transfer'
VERSION = '0.2.0'
PORT = int(os.environ.get('GSE_PORT', '46606'))
GTA_TITLES = ['PPSA01547', 'PPSA38500']          # GTA VI 各区版本
NOWIN = 0x08000000 if os.name == 'nt' else 0
PY = sys.executable
LAST_SEEN = {'t': time.time()}


def py_cmd(mod, *args):
    """在子进程里运行一个模块：开发时走 main.py，打包后走 exe 自己。"""
    head = [PY, '--mod'] if FROZEN else [PY, '-u', str(ROOT / 'engine' / 'main.py'), '--mod']
    return head + [mod, *map(str, args)]
LOCK = threading.RLock()

CFG = {}
try:
    CFG = json.loads((DATA / 'config.json').read_text('utf-8'))
except Exception:
    pass
G = garlic.Garlic(CFG.get('serverUrl'), CFG.get('workerKey'), CFG.get('proxy'))

STATE = {'console': None, 'paired': False, 'session': None, 'user': None, 'entryId': None, 'title': None,
         'slots': [], 'readyToUpload': False, 'network': None}
JOB = {'id': 0, 'kind': None, 'status': 'idle', 'stage': None, 'needPower': False, 'progress': None, 'error': None, 'hint': None, 'log': []}
PROC = {'p': None}
RELAY = {'r': None}


def log(msg):
    with LOCK:
        JOB['log'].append({'t': round(time.time(), 1), 'm': str(msg)[:300]})
        del JOB['log'][:-200]


def relay():
    if RELAY['r'] is None:
        RELAY['r'] = garlic.OracleRelay(G, log)
    return RELAY['r']


def vendor_env(extra=None):
    e = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1')
    e.update(extra or {})
    return e


def console_dir():
    return DATA / 'consoles' / STATE['console']['hostId']


def prefix_path():
    c = STATE['console']
    return console_dir() / ('pairing-%s.bin' % c['firmware'])


def refresh_paired():
    c = STATE['console']
    if not c:
        STATE['paired'] = False; return
    p = prefix_path()
    if not p.is_file():                      # 沿用本机 GarlicTransfer 已有的配对
        old = GT_DIR / 'pairings' / ('%s-%s' % (c['hostId'].upper(), c['firmware'].upper())) / 'pairing-prefix.bin'
        if old.is_file() and old.stat().st_size == 32:
            p.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(old, p)
    STATE['paired'] = p.is_file() and p.stat().st_size == 32


# ---------------- 任务框架 ----------------
class Fail(Exception):
    def __init__(self, code, detail=''):
        super().__init__(code); self.code, self.detail = code, detail


def start_job(kind, fn):
    with LOCK:
        if JOB['status'] == 'running':
            raise Fail('busy')
        JOB.update(id=JOB['id'] + 1, kind=kind, status='running', stage='starting', needPower=False, progress=None, error=None, hint=None, log=[])

    def run():
        try:
            fn()
            with LOCK:
                JOB.update(status='done', needPower=False)
        except Fail as e:
            log('FAIL %s %s' % (e.code, e.detail))
            with LOCK:
                JOB.update(status='error', error={'code': e.code, 'detail': str(e.detail)[:300]}, needPower=False)
        except Exception as e:
            log(traceback.format_exc()[-600:])
            with LOCK:
                JOB.update(status='error', error={'code': 'internal', 'detail': repr(e)[:300]}, needPower=False)
        finally:
            kill_proc()
    threading.Thread(target=run, daemon=True).start()
    return JOB['id']


def stage(s, **kw):
    with LOCK:
        JOB.update(stage=s, **kw)
    log('stage: ' + s)


def kill_proc():
    p = PROC['p']; PROC['p'] = None
    if p and p.poll() is None:
        try:
            subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True, creationflags=NOWIN) if os.name == 'nt' else p.kill()
        except Exception:
            pass


def spawn(args, env=None, stdin_text=None):
    p = subprocess.Popen(py_cmd(*args), cwd=str(DATA), env=vendor_env(env), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.PIPE, text=True, encoding='utf-8', errors='replace', creationflags=NOWIN)
    PROC['p'] = p
    if stdin_text is not None:
        p.stdin.write(stdin_text); p.stdin.flush()
    return p


def run_tool(args, timeout=120):
    r = subprocess.run(py_cmd(*args), cwd=str(DATA), env=vendor_env(), capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout, creationflags=NOWIN)
    if r.returncode != 0:
        raise Fail('tool_failed', (r.stdout + r.stderr)[-300:])
    return r.stdout


# ---------------- 各步骤 ----------------
def local_ipv4s():
    """本机各网卡的 (IP, 广播地址)。macOS 上 gethostbyname_ex 常只解析出 127.0.0.1，改读 ifconfig。"""
    if MAC:
        txt = subprocess.run(['/sbin/ifconfig'], capture_output=True, text=True, timeout=5).stdout
        return re.findall(r'inet (\d+\.\d+\.\d+\.\d+) netmask \S+ broadcast (\d+\.\d+\.\d+\.\d+)', txt)
    import socket
    return [(ip, ip.rsplit('.', 1)[0] + '.255') for ip in set(socket.gethostbyname_ex(socket.gethostname())[2])]


def sweep(timeout=2.5):
    """广播没人回时，向本机所在 /24 的每个地址单播 SRCH。有的路由器不把广播转给主机（实测：Mac 走 Wi-Fi 时 PS5 不回广播，单播会回）。"""
    import socket, select
    from poc.dt_discovery import SRCH, parse_response
    found, socks = {}, []
    try:
        for ip, _ in local_ipv4s():
            if ip.startswith(('127.', '169.254.', '198.18.')):
                continue
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); socks.append(s)
            s.bind((ip, 0)); s.setblocking(False)
            for n in range(1, 255):
                host = ip.rsplit('.', 1)[0] + '.%d' % n
                if host != ip:
                    try:
                        s.sendto(SRCH, (host, 1006))
                    except OSError:
                        pass
        end = time.time() + timeout
        while socks and time.time() < end:
            for s in select.select(socks, [], [], 0.2)[0]:
                try:
                    d, a = s.recvfrom(4096)
                except OSError:
                    continue
                if d.startswith(b'HTTP/1.1'):
                    found[a[0]] = parse_response(d, a)
    finally:
        for s in socks:
            s.close()
    return list(found.values())


def discover():
    routes = [{'bind': '', 'target': '255.255.255.255'}]
    try:                                        # 每块网卡的子网广播各发一次，全局广播在有虚拟网卡/代理时常走错口
        for ip, bc in local_ipv4s():
            if not ip.startswith(('127.', '169.254.', '198.18.')):
                routes.append({'bind': ip, 'target': bc})
    except (OSError, subprocess.SubprocessError):
        pass
    out = run_tool(['poc.dt_discovery', '--timeout', '3', '--routes', json.dumps(routes)], timeout=30)
    cons = json.loads(out.strip().splitlines()[-1])['consoles']
    try:                                        # 上次用过的主机单独探测一次（不在同一网段时广播搜不到）
        last = json.loads((DATA / 'last_console.json').read_text('utf-8'))['host']
        if not any(c['host'] == last for c in cons):
            c = probe_host(last)
            if c:
                cons.append(c)
    except Exception:
        pass
    if not cons:
        try:
            cons = sweep()
        except (OSError, subprocess.SubprocessError):
            pass
    # 过滤掉本机上冒充主机的传输进程（hostId 02000000xxxx）
    return [{'host': c['host'], 'name': c['name'], 'hostId': c['hostId'], 'firmware': c['firmware']} for c in cons
            if c.get('hostId') and not c['hostId'].startswith('0200000000') and not c['host'].startswith('127.')]


def probe_host(host):
    out = run_tool(['poc.dt_discovery', '--broadcast', host, '--timeout', '3'], timeout=30)
    cons = json.loads(out.strip().splitlines()[-1])['consoles']
    return cons[0] if cons else None


def job_pair():
    c = STATE['console']; prefix_path().parent.mkdir(parents=True, exist_ok=True)
    opts = {'ps5Ip': c['host'], 'hostId': c['hostId'], 'systemVersion': c['firmware'], 'oracleHost': '127.0.0.1', 'oraclePort': relay().port,
            'prefixPath': str(prefix_path()), 'duration': 300}
    p = spawn(['poc.dt_pair', '-'], stdin_text=json.dumps(opts) + '\n')
    stage('pair_waiting_console')
    ok = False
    for line in p.stdout:
        line = line.strip(); log(line)
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get('type') == 'status' and 'connected' in ev.get('message', ''):
            stage('pair_reading')
        if ev.get('type') == 'paired':
            ok = True
        if ev.get('type') == 'error':
            raise Fail('pair_failed', ev.get('message'))
    p.wait()
    if not ok:
        raise Fail('pair_failed')
    refresh_paired(); stage('paired')


def sfo_fields(path):
    p = Path(path).read_bytes(); out = {}
    magic, ver, kt, dt, n = struct.unpack_from('<4sIIII', p, 0)
    for i in range(n):
        ko, fmt, ln, mx, do = struct.unpack_from('<HHIII', p, 20 + 16 * i)
        k = p[kt + ko:p.index(b'\0', kt + ko)].decode()
        d = p[dt + do:dt + do + ln]
        out[k] = d.rstrip(b'\0').decode('utf-8', 'replace') if fmt == 0x204 else d
    acct = b''
    for off in (0x1b8, 0x15c):
        v = p[off:off + 8]
        if any(v):
            acct = v; break
    out['_account'] = acct.hex()
    return out


def load_slot(sess, name, enc_path):
    """解密一个存档槽并读出金额。"""
    dec_root = sess / 'dec'
    top = Path(G.decrypt(str(enc_path), str(dec_root), on_status=lambda s: log('decrypt %s: %s' % (name, s))))
    return read_slot(name, top)


# sce_sdmemory 是游戏的自动存档（「继续游戏」读的就是它），里面的 memory.dat 和手动存档同一格式
SLOT_RE = re.compile(r'sdimg_(SAVEDATASARC\d+|sce_sdmemory)')


def read_slot(name, top):
    """从已解密的目录读出一个存档槽的金额。"""
    inner = 'memory.dat' if name == 'sdimg_sce_sdmemory' else name.replace('sdimg_SAVEDATA', '')
    f = top / inner
    if not f.is_file():
        raise Fail('unexpected_save_layout', name)
    sfo = sfo_fields(top / 'sce_sys' / 'param.sfo')
    info = money.scan(f.read_bytes())
    return {'file': name, 'inner': inner, 'subtitle': sfo.get('SUBTITLE', ''), 'revision': sfo.get('SAVEDATA_REVISION', b'').hex() if isinstance(sfo.get('SAVEDATA_REVISION'), bytes) else '',
            'dir': str(top), 'account': sfo['_account'], 'items': info['items'], 'ledger': info['ledger'], 'modified': False, 'changes': []}


RESTORE_HOURS = float(os.environ.get('GSE_RESTORE_HOURS', 6))


def restore_session():
    """App 重启后接上最近一次下载，免得再按电源键重新下载。只读本地文件，不连主机、不联网。
    已传回过、或超过 RESTORE_HOURS 小时的不接：玩家可能已在游戏里存了新档，改旧档会盖掉新进度。"""
    sessions = sorted(p for p in (console_dir() / 'sessions').glob('*') if p.is_dir())
    if not sessions:
        return
    sess = sessions[-1]
    try:
        age = time.time() - time.mktime(time.strptime(sess.name, '%Y%m%d-%H%M%S'))
    except ValueError:
        return
    if age > RESTORE_HOURS * 3600 or (sess / 'uploaded').exists():
        return
    lib = sess / 'lib'
    db = sqlite3.connect((lib / 'Transfer-Metadata' / 'metadata.db').as_uri() + '?mode=ro', uri=True)
    try:
        rows = db.execute('SELECT id, path FROM dir_entry_info_tbl ORDER BY id').fetchall()
        names = {'%08x' % u: n or l or o for u, n, l, o in db.execute('SELECT user_id, user_name, login_id, online_id FROM user_info_tbl')}
    finally:
        db.close()
    for entry_id, path in rows:                 # 和 job_download 一样取第一个 GTA 存档条目
        parts = path.strip('/').split('/')
        if len(parts) > 2 and parts[-1] in GTA_TITLES and (lib / 'Saves' / parts[2] / parts[-1]).is_dir():
            owner, title = parts[2], parts[-1]
            break
    else:
        return
    slots = []
    for f in sorted((lib / 'Saves' / owner / title).glob('sdimg_*')):
        top = sess / 'dec' / f.name
        if SLOT_RE.fullmatch(f.name) and top.is_dir():
            s = read_slot(f.name, top)
            orig = sess / 'orig' / f.name
            s['modified'] = orig.is_file() and orig.read_bytes() != f.read_bytes()   # 传输库里已是改过的档
            slots.append(s)
    if not slots:
        return
    with LOCK:
        STATE.update(session=str(sess), user={'id': owner, 'name': names.get(owner.lower(), 'user')}, entryId=entry_id, title=title,
                     slots=slots, readyToUpload=any(s['modified'] for s in slots))
    log('restored session ' + sess.name)


def job_download():
    c = STATE['console']
    if not STATE['paired']:
        raise Fail('not_paired')
    if not G.reachable():
        raise Fail('garlic_unreachable')
    sess = console_dir() / 'sessions' / time.strftime('%Y%m%d-%H%M%S'); lib = sess / 'lib'; lib.mkdir(parents=True)
    opts = {'oracleHost': '127.0.0.1', 'oraclePort': relay().port, 'clientHost': c['host'], 'output': str(lib), 'interface': '',
            'hostId': c['hostId'], 'systemVersion': c['firmware'], 'hardware': 0, 'approvalPrefixPath': str(prefix_path()),
            'waitForSelection': True, 'titles': GTA_TITLES}
    p = spawn(['dl_worker', json.dumps(opts)])
    stage('connecting')
    entries, users, nosave, err, files = [], [], False, None, 0
    for line in p.stdout:
        line = line.rstrip()
        if line.startswith('[file] saved'):
            files += 1
            with LOCK:
                JOB['progress'] = {'files': files}
            log('saved file %d' % files); continue
        try:
            ev = json.loads(line)
        except ValueError:
            if line and not line.startswith(('[ddp]', 'host-', 'device-', 'system-')):
                log(line)
            continue
        t = ev.get('type')
        if t == 'powerRequired':
            stage('need_power', needPower=True)
        elif t == 'status' and ev.get('step') == 3:
            stage('reading_list', needPower=False)
        elif t == 'status' and ev.get('step') == 4:
            stage('downloading', needPower=False)
        elif t == 'entries':
            entries, users = ev['entries'], ev.get('users') or []
        elif t == 'nosave':
            nosave = True
        elif t == 'error':
            err = ev.get('message')
        elif t == 'log':
            log(ev.get('message'))
    p.wait()
    if err:
        m = err.lower()
        raise Fail('power_timeout' if 'timed out' in m or 'timeout' in m else 'console_rejected' if 'rejected' in m else 'download_failed', err)
    if nosave or not entries:
        raise Fail('no_gta_save')
    e = entries[0]; owner = e['owner']
    uname = next((u['name'] for u in users if u['id'].lower() == owner.lower()), 'user')
    save_dir = lib / 'Saves' / owner / e['title']
    imgs = sorted(save_dir.glob('sdimg_*'))
    if not imgs:
        raise Fail('download_failed', 'no files')
    (sess / 'orig').mkdir()
    for f in imgs:
        shutil.copyfile(f, sess / 'orig' / f.name)
    stage('decrypting')
    slots = []
    for f in imgs:
        if SLOT_RE.fullmatch(f.name):
            slots.append(load_slot(sess, f.name, f))
    if not slots:
        raise Fail('no_story_slot')
    slots.sort(key=lambda s: s['file'])
    with LOCK:
        STATE.update(session=str(sess), user={'id': owner, 'name': uname}, entryId=e['id'], title=e['title'], slots=slots, readyToUpload=False)
    stage('ready')


def job_patch(slot_file, changes):
    sess = Path(STATE['session'])
    slot = next((s for s in STATE['slots'] if s['file'] == slot_file), None)
    if not slot:
        raise Fail('bad_slot')
    stage('patching')
    src = Path(slot['dir']) / slot['inner']
    try:
        data, plog = money.patch(src.read_bytes(), changes)
    except money.SaveError as e:
        raise Fail('save_' + str(e))
    if not plog:
        raise Fail('no_change')
    mod = sess / 'mod' / Path(slot['dir']).name
    if mod.exists():
        shutil.rmtree(mod)
    shutil.copytree(slot['dir'], mod)
    (mod / slot['inner']).write_bytes(data)
    z = sess / 'mod' / (slot['file'] + '.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, ds, fs in os.walk(mod):
            ds.sort()
            for f in sorted(fs):
                fp = Path(root) / f
                zf.write(fp, fp.relative_to(mod.parent).as_posix())
    stage('encrypting')
    enc = sess / 'enc'; enc.mkdir(exist_ok=True)
    out = G.encrypt(str(z), slot['account'], str(enc / slot['file']), on_status=lambda s: log('encrypt: ' + s))
    stage('importing')
    run_tool(['poc.dt_local_saves', 'import', str(sess / 'lib'), str(STATE['entryId']), slot['file'], out])
    with LOCK:
        slot['modified'] = True; slot['changes'] = [{'kind': next(x['kind'] for x in slot['items'] if money.same_item(x, c)),
                                                     'from': c['value'], 'to': int(c['newValue'])} for c in changes if int(c['newValue']) != c['value']]
        STATE['readyToUpload'] = True
    stage('ready_to_upload')


def job_restore():
    """把原档放回传输库（之后照常上传即可恢复）。"""
    sess = Path(STATE['session']); stage('importing')
    for s in STATE['slots']:
        if s['modified']:
            run_tool(['poc.dt_local_saves', 'import', str(sess / 'lib'), str(STATE['entryId']), s['file'], str(sess / 'orig' / s['file'])])
            with LOCK:
                s['modified'] = False; s['changes'] = []
    with LOCK:
        STATE['readyToUpload'] = True
    stage('ready_to_upload')


def job_upload():
    c = STATE['console']; sess = Path(STATE['session']); lib = sess / 'lib'; up = sess / 'upload'; up.mkdir(exist_ok=True)
    stage('preparing')
    run_tool(['poc.dt_metadata', '--output', str(up / 'generated-metadata.db'), '--user-id', STATE['user']['id'], '--assets', str(lib),
              '--user-name', STATE['user']['name'], '--manifest-output', str(up / 'generated-upload-manifest.json'),
              '--source', str(lib / 'Transfer-Metadata' / 'metadata.db'), '--entry-id', str(STATE['entryId'])])
    total = len(list((lib / 'Saves' / STATE['user']['id'] / STATE['title']).glob('sdimg_*')))
    env = {'DT_METADATA': str(up / 'generated-metadata.db'), 'DT_ASSETS': str(lib), 'DT_MANIFEST': str(up / 'generated-upload-manifest.json'),
           'DT_UPLOAD_KIND': 'save', 'DT_LOG': str(up / 'dt-source.log'), 'DT_PAIRING_PREFIX': str(prefix_path()), 'DT_EXPECTED_HOST_ID': c['hostId'],
           'DT_AUTO_POWER': '1', 'DT_PORT': '1004', 'DT_DATA_PORT': '1005', 'DT_DISCOVERY_PORT': '1006', "DT_HOST_NAME": "GTA6 Save Editor",
           'DT_ORACLE_HOST': '127.0.0.1', 'DT_ORACLE_PORT': str(relay().port), 'DT_SYSTEM_VERSION': c['firmware']}
    if MAC:     # Mac 走 Wi-Fi 时常收不到主机的搜索广播：让传回程序主动向主机报到
        env['DT_CONSOLE_IP'] = c['host']
    p = spawn(['poc.dt_source'], env=env)
    stage('waiting_console')
    files = 0; finished = False
    for line in p.stdout:
        line = line.rstrip(); low = line.lower()
        if 'srch' in low or not line:
            continue
        if '[tcp] connection from' in low:
            stage('console_connected', hint=None)
        elif 'gfp5 id=' in low and files == 0:
            stage('transferring')
        elif 'gfp5 file complete' in low:
            files += 1
            with LOCK:
                JOB['progress'] = {'files': files, 'total': total}
        elif 'response complete cmd=0xb3' in low:
            finished = True
        elif 'response complete cmd=0x94' in low:
            if finished and files:
                break
            if files == 0:
                # 主机看完清单就走了：通常是主机上还留着同名存档
                with LOCK:
                    JOB['hint'] = 'console_has_save'
                stage('waiting_console')
        elif 'address already in use' in low or 'winerror 10048' in low:
            raise Fail('port_in_use', line)
        elif 'traceback' in low or 'error' in low:
            log(line)
    if not (finished and files):
        raise Fail('upload_failed', 'process ended')
    time.sleep(3)
    (sess / 'uploaded').touch()                 # 已传回的下载不再自动接上
    stage('uploaded')
    with LOCK:
        STATE['readyToUpload'] = False


# ---------------- HTTP ----------------
def same_subnet(host):
    """电脑和主机是否在同一个 /24 网段。不在的话下载能通，但传回时主机搜不到电脑。"""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as r:
            r.connect((host, 1006)); mine = r.getsockname()[0]
        return mine.rsplit('.', 1)[0] == host.rsplit('.', 1)[0]
    except OSError:
        return None


def public_state():
    with LOCK:
        s = json.loads(json.dumps({k: v for k, v in STATE.items()}))
        for sl in s['slots']:
            sl.pop('dir', None); sl.pop('account', None)
            for it in sl['items']:
                it.pop('type', None)
        s.pop('session', None)
        s['hasSession'] = bool(STATE['session'])
        if s['console']:
            s['console']['sameSubnet'] = same_subnet(s['console']['host'])
        s['job'] = json.loads(json.dumps(JOB)); s['job']['log'] = s['job']['log'][-40:]
        s['titles'] = GTA_TITLES
        s['version'] = VERSION
        return s


class H(BaseHTTPRequestHandler):
    server_version = "GTA6SaveEditor"

    def log_message(self, *a):
        pass

    def _send(self, code, obj=None, raw=None, ctype='application/json; charset=utf-8'):
        body = raw if raw is not None else json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)

    def _local_only(self):
        host = (self.headers.get('Host') or '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost'):
            return False
        o = self.headers.get('Origin')
        return not o or re.fullmatch(r'https?://(127\.0\.0\.1|localhost)(:\d+)?', o) is not None

    def do_GET(self):
        if not self._local_only():
            return self._send(403, {'error': 'forbidden'})
        path = self.path.split('?')[0]
        if path == '/api/state':
            LAST_SEEN['t'] = time.time()
            return self._send(200, public_state())
        rel = 'index.html' if path == '/' else path.lstrip('/')
        f = (UI / rel).resolve()
        if UI.resolve() not in f.parents or not f.is_file():
            return self._send(404, {'error': 'not_found'})
        self._send(200, raw=f.read_bytes(), ctype=(mimetypes.guess_type(str(f))[0] or 'application/octet-stream') + ('; charset=utf-8' if f.suffix in ('.html', '.js', '.css') else ''))

    def do_POST(self):
        if not self._local_only():
            return self._send(403, {'error': 'forbidden'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}') if n else {}
            path = self.path.split('?')[0]
            if path == '/api/discover':
                cons = discover()
                return self._send(200, {'consoles': cons})
            if path == '/api/console':
                c = probe_host(body['host'])
                if not c:
                    raise Fail('console_not_found')
                with LOCK:
                    STATE['console'] = {'host': c['host'], 'name': c['name'], 'hostId': c['hostId'], 'firmware': c['firmware']}
                    STATE.update(session=None, slots=[], readyToUpload=False, user=None, entryId=None)
                    refresh_paired()
                    try:
                        restore_session()
                    except Exception as e:
                        log('restore skipped: %r' % e)
                    (DATA / 'last_console.json').write_text(json.dumps({'host': c['host']}), 'utf-8')
                return self._send(200, public_state())
            if path == '/api/network':
                ok = G.reachable()
                with LOCK:
                    STATE['network'] = {'ok': ok, 'proxy': bool(G.proxy)}
                return self._send(200, STATE['network'])
            if path == '/api/cancel':
                kill_proc()
                return self._send(200, {'ok': True})
            if path == '/api/quit':
                if JOB['status'] == 'running' and JOB['stage'] in ('console_connected', 'transferring'):
                    raise Fail('busy')
                self._send(200, {'ok': True})
                threading.Thread(target=lambda: (time.sleep(0.3), kill_proc(), os._exit(0)), daemon=True).start()
                return
            if not STATE['console']:
                raise Fail('no_console')
            if path == '/api/pair':
                return self._send(200, {'job': start_job('pair', job_pair)})
            if path == '/api/download':
                return self._send(200, {'job': start_job('download', job_download)})
            if not STATE['session']:
                raise Fail('no_session')
            if path == '/api/patch':
                slot, changes = body['slot'], body['changes']
                return self._send(200, {'job': start_job('patch', lambda: job_patch(slot, changes))})
            if path == '/api/restore':
                return self._send(200, {'job': start_job('restore', job_restore)})
            if path == '/api/upload':
                if not STATE['readyToUpload']:
                    raise Fail('nothing_to_upload')
                return self._send(200, {'job': start_job('upload', job_upload)})
            self._send(404, {'error': 'not_found'})
        except Fail as e:
            self._send(409, {'error': e.code, 'detail': str(e.detail)})
        except (KeyError, ValueError) as e:
            self._send(400, {'error': 'bad_request', 'detail': repr(e)})
        except Exception as e:
            self._send(500, {'error': 'internal', 'detail': repr(e)})


def already_running():
    import urllib.request
    try:
        op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with op.open('http://127.0.0.1:%d/api/state' % PORT, timeout=2) as r:
            return 'titles' in json.loads(r.read().decode('utf-8'))
    except Exception:
        return False


def idle_watch():
    """页面关掉 10 分钟且没有任务在跑，就自己退出，免得后台一直留着进程。"""
    while True:
        time.sleep(30)
        if JOB['status'] != 'running' and time.time() - LAST_SEEN['t'] > 600:
            kill_proc(); os._exit(0)


def main():
    import webbrowser
    url = 'http://127.0.0.1:%d' % PORT
    open_ui = (FROZEN or '--open' in sys.argv) and not os.environ.get('GSE_NO_OPEN')
    if already_running():                       # 已经开着：只把页面再打开一次
        if open_ui:
            webbrowser.open(url)
        return
    DATA.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), H)
    print('GTA6 Save Editor running: ' + url, flush=True)
    if FROZEN:
        threading.Thread(target=idle_watch, daemon=True).start()
    if open_ui:
        webbrowser.open(url)
    srv.serve_forever()


if __name__ == '__main__':
    main()
