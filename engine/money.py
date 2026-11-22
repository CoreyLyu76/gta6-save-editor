"""GTA VI 解密后 JSAV 存档的金额读取与修改（与 web 版 core.js 同一套逻辑）。"""
import json, struct

MONEY_CAT = 2084597891
TYPES = {2177639769: 'bank', 4163145158: 'cash'}
STAT_BANK, STAT_CASH = 2027, (552, 3273)


class SaveError(Exception):
    pass


def _load(b):
    if b[:4] != b'JSAV':
        raise SaveError('not_jsav')
    n = sum(struct.unpack_from('<II', b, 8))
    ents = [list(struct.unpack_from('<IIIII', b, 16 + 20 * i)) for i in range(n)]
    secs = [b[e[3]:e[3] + e[4]] for e in ents]
    gaps = [b[ents[i][3] + ents[i][4]:ents[i + 1][3]] for i in range(n - 1)]
    end = ents[-1][3] + ents[-1][4]
    return ents, secs, gaps, b[:ents[0][3]], b[end:end + 4]


def _sec(ents, h):
    for i, e in enumerate(ents):
        if e[0] == h:
            return i
    raise SaveError('layout_changed')


def _inv_span(txt, nth):
    p = txt.index(b'"$0x789bdd41":')
    for _ in range(nth + 1):
        p = txt.index(b'"$0xfc8f2620":', p + 1)
    p = txt.index(b'"$0xe3fead7a":', p)
    s = txt.index(b'[', p) + 1
    return s, txt.index(b']', s)


def _stat_span(txt):
    p = txt.index(b'"$0x97232209":'); p = txt.index(b'"$0x450ce2f0":', p)
    s = txt.index(b'[', p) + 1
    return s, txt.index(b']', s)


def _set(txt, span, idx, old, new):
    it = txt[span[0]:span[1]].split(b',')
    if it[idx] != str(old).encode():
        raise SaveError('verify_failed')
    it[idx] = str(new).encode()
    return txt[:span[0]] + b','.join(it) + txt[span[1]:]


def scan(b):
    ents, secs, _, _, _ = _load(b)
    invs = json.loads(secs[_sec(ents, 0xd3f59a5e)])['$0x7a47cb05']['$0xd3f59a5e']['$0x789bdd41']
    items = []
    for n, inv in enumerate(invs):
        f = inv.get('$0xfc8f2620') or {}
        q = (f.get('$0xe3fead7a') or {}).get('$data'); c = (f.get('$0xbe8e255c') or {}).get('$data'); t = (f.get('$0x12ae4287') or {}).get('$data')
        if not q:
            continue
        for k, v in enumerate(q):
            if c[k] == MONEY_CAT:
                items.append({'inv': n, 'idx': k, 'type': t[k], 'kind': TYPES.get(t[k], 'other'), 'value': v})
    stats = json.loads(secs[_sec(ents, 0x0635cbd9)])['$0x7a47cb05']['$0x0635cbd9']['$0x97232209']['$0x450ce2f0']['$data']
    ledger = None
    try:
        l = json.loads(secs[_sec(ents, 0x6296c122)])['$0x24d043f2']['$0x6296c122']['$0x45a134ec']['$0x1e1e8a08'][-1]
        ledger = {'amount': l['$0xa662d8be'], 'balance': l['$0x818f6f6d']}
    except Exception:
        pass
    return {'items': items, 'statBank': stats[STAT_BANK], 'statCash': [stats[i] for i in STAT_CASH], 'ledger': ledger}


def patch(b, changes):
    """changes: [{inv, idx, value(旧值), newValue}] -> (新文件 bytes, 说明列表)"""
    ents, secs, gaps, head, tail = _load(b)
    info = scan(b); log = []
    i_inv, i_stat = _sec(ents, 0xd3f59a5e), _sec(ents, 0x0635cbd9)
    for ch in changes:
        it = next((x for x in info['items'] if x['inv'] == ch['inv'] and x['idx'] == ch['idx']), None)
        if not it or it['value'] != ch['value']:
            raise SaveError('stale_item')
        nv = int(round(ch['newValue']))
        if not 0 <= nv <= 2147483647:
            raise SaveError('out_of_range')
        if nv == it['value']:
            continue
        secs[i_inv] = _set(secs[i_inv], _inv_span(secs[i_inv], it['inv']), it['idx'], it['value'], nv)
        log.append({'what': 'inventory', 'kind': it['kind'], 'from': it['value'], 'to': nv})
        if it['kind'] == 'bank':
            if info['statBank'] == it['value']:
                secs[i_stat] = _set(secs[i_stat], _stat_span(secs[i_stat]), STAT_BANK, it['value'], nv); log.append({'what': 'stat_bank'})
            led = info['ledger']
            if led and led['balance'] == it['value']:
                i_led = _sec(ents, 0x6296c122)
                t = b'"$0xa662d8be":%d,"$0x818f6f6d":%d}' % (led['amount'], led['balance'])
                k = secs[i_led].rfind(t)
                if k < 0:
                    raise SaveError('ledger_not_found')
                secs[i_led] = secs[i_led][:k] + b'"$0xa662d8be":%d,"$0x818f6f6d":%d}' % (led['amount'] + nv - it['value'], nv) + secs[i_led][k + len(t):]
                log.append({'what': 'ledger'})
            else:
                log.append({'what': 'ledger_skipped'})
        elif it['kind'] == 'cash':
            for j, si in enumerate(STAT_CASH):
                if info['statCash'][j] == it['value']:
                    secs[i_stat] = _set(secs[i_stat], _stat_span(secs[i_stat]), si, it['value'], nv); log.append({'what': 'stat_cash'})
    out = bytearray(head)
    for i, s in enumerate(secs):
        json.loads(s)
        ents[i][3], ents[i][4] = len(out), len(s); out += s
        if i < len(secs) - 1:
            out += gaps[i]
    out += tail
    for i, e in enumerate(ents):
        struct.pack_into('<IIIII', out, 16 + 20 * i, *e)
    out += b'\0' * ((-len(out)) % 16)
    if len(out) < len(b):
        out += b'\0' * (len(b) - len(out))
    return bytes(out), log
