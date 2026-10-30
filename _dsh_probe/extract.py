import json, struct, sys, os
ASAR = r"D:\装机软件\DSH\resources\app.asar"
OUT = r"D:\Workspace\personal_space\_dsh_probe\out"
def parse():
    with open(ASAR,'rb') as f:
        d=f.read(16)
        header_size=struct.unpack('<I',d[4:8])[0]
        json_len=struct.unpack('<I',d[12:16])[0]
        f.seek(16); hdr=f.read(json_len)
        return json.loads(hdr.decode('utf-8')), 8+header_size
def get(root):
    h,base=parse()
    node=h['files']
    for part in root.strip('/').split('/'):
        if not part: continue
        node=node['files'][part]
    return node, base
def extract(rootpath):
    node,base=get(rootpath)
    p=os.path.join(OUT, rootpath.strip('/').replace('/', os.sep))
    if 'files' in node:
        os.makedirs(p, exist_ok=True)
        for name in node['files']:
            extract(rootpath.rstrip('/')+'/'+name)
    else:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        off = base + int(node['offset'])
        with open(ASAR,'rb') as f:
            f.seek(off); data=f.read(node['size'])
        with open(p,'wb') as o: o.write(data)
        print('wrote', p, node['size'])
if __name__=='__main__':
    for a in sys.argv[1:]:
        extract(a)
