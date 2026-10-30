import json, struct, sys, os

ASAR = r"D:\装机软件\DSH\resources\app.asar"

def read_header(path=ASAR):
    with open(path,'rb') as f:
        head = f.read(16)
        # pickles: 4 bytes size, then payload
        # header: uint32 4 (size of next), uint32 headerSize ... simplified
        f.seek(0)
        b = f.read(8)
        # asar format: uint32 4, uint32 header_size_at_8? Actually:
        # [4 bytes: 4][4 bytes: header_size_pickle_len? ]
        pass

def parse(path=ASAR):
    with open(path,'rb') as f:
        data = f.read(16)
        (a,) = struct.unpack('<I', data[0:4])
        (header_size,) = struct.unpack('<I', data[4:8])
        (c,) = struct.unpack('<I', data[8:12])
        (json_len,) = struct.unpack('<I', data[12:16])
        f.seek(16)
        hdr = f.read(json_len)
        base = 8 + header_size
        return json.loads(hdr.decode('utf-8')), base

if __name__ == '__main__':
    h, base = parse()
    print('header keys:', list(h.keys()), 'base offset:', base)
    files = h['files']
    print('top level:', list(files.keys()))
