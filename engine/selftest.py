"""不需要 PS5 的自测：用一份已下载的加密存档走 解密 -> 读金额 -> 改 -> 加密 -> 放入传输库 -> 再解密回读。
用法: python engine/selftest.py <已有的 lib 目录> <用户id> <标题id> <条目号>"""
import sys, shutil, time, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import app
src, user, title, entry = Path(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4])
app.STATE['console'] = {'host': '0.0.0.0', 'name': 'selftest', 'hostId': 'SELFTEST0000', 'firmware': '00000000'}
sess = app.console_dir() / 'sessions' / time.strftime('%Y%m%d-%H%M%S'); shutil.copytree(src, sess / 'lib')
(sess / 'orig').mkdir()
imgs = sorted((sess / 'lib' / 'Saves' / user / title).glob('sdimg_*'))
for f in imgs: shutil.copyfile(f, sess / 'orig' / f.name)
slots = [app.load_slot(sess, f.name, f) for f in imgs if 'SARC' in f.name]
app.STATE.update(session=str(sess), user={'id': user, 'name': 'user'}, entryId=entry, title=title, slots=slots)
for s in slots: print(s['file'], [(i['kind'], i['inv'], i['value']) for i in s['items']], 'ledger', s['ledger'])
s = slots[-1]; ch = [dict(i, newValue=8000000) for i in s['items'] if i['kind'] == 'bank']
app.job_patch(s['file'], ch)
enc = sess / 'enc' / s['file']; libf = sess / 'lib' / 'Saves' / user / title / s['file']
print('encrypted size', enc.stat().st_size, '| imported into lib:', enc.read_bytes() == libf.read_bytes(), '| changes', s['changes'], '| ready', app.STATE['readyToUpload'])
(sess / 'verify').mkdir()
back = app.load_slot(sess / 'verify', s['file'], enc)
print('round-trip bank:', [i['value'] for i in back['items'] if i['kind'] == 'bank'], 'ledger', back['ledger'])
