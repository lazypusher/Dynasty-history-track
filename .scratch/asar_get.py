import json, struct, sys, os

path = r"D:\装机软件\DSH\resources\app.asar"
f = open(path, "rb")
head = f.read(8)
header_size = struct.unpack("<I", head[4:8])[0]
header = f.read(header_size).decode("utf-8", "replace")
header = header[header.find("{"): header.rfind("}") + 1]
tree = json.loads(header)
base_offset = 8 + header_size

# asar pads header to 4-byte alignment; compute real base from first file offset? use standard: 8 + align4(header_size)
def align4(n):
    return (n + 3) & ~3

base_offset = 8 + align4(header_size)


def find(prefix):
    node = tree
    for part in [p for p in prefix.split("/") if p]:
        node = node["files"][part]
    return node


def extract(node, prefix, dest):
    for name, v in node.get("files", {}).items():
        p = os.path.join(dest, name)
        if "files" in v:
            os.makedirs(p, exist_ok=True)
            extract(v, prefix + "/" + name, p)
        else:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(path, "rb") as src:
                src.seek(base_offset + int(v["offset"]))
                data = src.read(v["size"])
            with open(p, "wb") as out:
                out.write(data)


sub = sys.argv[1]
dest = sys.argv[2]
node = find(sub)
if "files" in node:
    os.makedirs(dest, exist_ok=True)
    extract(node, sub, dest)
    print("extracted dir", sub)
else:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(path, "rb") as src:
        src.seek(base_offset + int(node["offset"]))
        with open(dest, "wb") as out:
            out.write(src.read(node["size"]))
    print("extracted file", sub, node["size"])
