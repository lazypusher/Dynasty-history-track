#!/usr/bin/env python3
"""分诊流程状态机。传入已完成步骤 id 的 JSON 数组，返回下一个动作。"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

STEPS = [
    {
        "id": "classify",
        "script": "classify",
        "args": ["<工单原文>", "<客户等级 S/A/B/C>"],
        "desc": "分级与定责打分",
    },
    {
        "id": "respond",
        "script": "respond",
        "args": ["<level>", "<客户等级>"],
        "desc": "生成处置动作与对外话术",
    },
    {"id": "close", "script": None, "args": [], "desc": "汇总输出，结束"},
]


def main() -> None:
    done = json.loads(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].strip() else []
    if not isinstance(done, list):
        print(json.dumps({"error": "expects a JSON array of completed step ids"}, ensure_ascii=False))
        return
    for step in STEPS:
        if step["id"] in done:
            continue
        remaining = [s["id"] for s in STEPS if s["id"] not in done and s["id"] != step["id"]]
        print(
            json.dumps(
                {
                    "next": step["id"],
                    "script": step["script"],
                    "args": step["args"],
                    "desc": step["desc"],
                    "remaining_after_this": remaining,
                },
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps({"next": None, "desc": "流程已完成"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
