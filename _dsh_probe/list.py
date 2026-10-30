import json, struct, sys
ASAR = r"D:\装机软件\DSH\resources\app.asar"
def parse():
    with open(ASAR,'rb') as f:
        d=f.read(16)
        header_size=struct.unpack('<I',d[4:8])[0]
        json_len=struct.unpack('<I',d[12:16])[0]
        f.seek(16); hdr=f.read(json_len)
        return json.loads(hdr.decode('utf-8')), 8+header_size
def walk(node, prefix='', out=None, depth=0):
    if out is None: out=[]
    for name,v in node.items():
        p=prefix+'/'+name
        if 'files' in v:
            out.append((p+'/', None, True))
            walk(v['files'], p, out, depth+1)
        else:
            out.append((p, v.get('size'), False))
    return out
if __name__=='__main__':
    h,base=parse()
    root=sys.argv[1].strip('/')
    node=h['files']
    for part in root.split('/'):
        if not part: continue
        node=node[part]
        if 'files' in node: node=node['files']
    entries=walk(node, '/'+root)
    maxdepth=int(sys.argv[2]) if len(sys.argv)>2 else 99
    for p,s,isdir in entries:
        if isdir and p.count('/')>maxdepth: continue
        print(('DIR  ' if isdir else 'FILE '), p, ('' if isdir else s))
