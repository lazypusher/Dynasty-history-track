import json, struct, sys

path = r"D:\装机软件\DSH\resources\app.asar"
f = open(path, "rb")
data = f.read(16)
size_pickle = struct.unpack("<I", data[0:4])[0]
header_size = struct.unpack("<I", data[4:8])[0]
header = f.read(header_size).decode("utf-8", "replace")
header = header[header.find("{"): header.rfind("}") + 1]
tree = json.loads(header)


def walk(node, prefix, depth=0, out=None):
    if out is None:
        out = []
    for name, v in node.get("files", {}).items():
        p = prefix + "/" + name
        if "files" in v:
            out.append(("D", p, 0))
            if depth < 6:
                walk(v, p, depth + 1, out)
        else:
            out.append(("F", p, v.get("size", 0)))
    return out


entries = walk(tree, "")
filt = sys.argv[1] if len(sys.argv) > 1 else None
for kind, p, size in entries:
    if filt and filt.lower() not in p.lower():
        continue
    if kind == "D" and p.count("/") > 4:
        continue
    print(kind, size, p)
print("TOTAL_ENTRIES", len(entries))
