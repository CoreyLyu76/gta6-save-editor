"""程序入口。平时启动本地服务；带 --mod 时在同一个解释器/同一个 exe 里运行某个模块（打包后没有独立的 python.exe 可用）。"""
import os, sys, runpy

FROZEN = getattr(sys, 'frozen', False)
BASE = getattr(sys, '_MEIPASS', None) or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (os.path.join(BASE, 'engine'), os.path.join(BASE, 'engine', 'workers'), os.path.join(BASE, 'vendor')):
    if p not in sys.path:
        sys.path.insert(0, p)


def _fix_stdio():
    for name in ('stdout', 'stderr'):                     # 窗口程序没有控制台时这俩是 None
        if getattr(sys, name) is None:
            setattr(sys, name, open(os.devnull, 'w', encoding='utf-8'))
        else:
            try:
                getattr(sys, name).reconfigure(encoding='utf-8', errors='replace')
            except Exception:
                pass


if __name__ == '__main__':
    _fix_stdio()
    if len(sys.argv) >= 3 and sys.argv[1] == '--mod':
        mod = sys.argv[2]
        sys.argv = [mod] + sys.argv[3:]
        runpy.run_module(mod, run_name='__main__', alter_sys=True)
    else:
        import app
        app.main()
