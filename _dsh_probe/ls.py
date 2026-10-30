import json, struct, sys
ASAR = r"D:\装机软件\DSH\resources\app.asar"
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
        node=node[part]
    return node, base
if __name__=='__main__':
    root=sys.argv[1]
    node,base=get(root)
    if 'files' in node: node=node['files']
    for name,v in sorted(node.items()):
        if 'files' in v:
            print('DIR ', name+'/', len(v['files']))
        else:
            print('FILE', name, v.get('size'))
