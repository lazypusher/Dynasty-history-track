#!/usr/bin/env python3
"""处置动作与对外话术。参数：分级、客户等级。"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

# --- 内部话术资产 ---
PLAYBOOK = {
    "P1": {
        "actions": ["10 分钟内电话回访", "冻结相关操作并留存日志", "拉重大客诉群", "2 小时内给出书面方案"],
        "tone": "先共情、给结论、给时间点；不解释内部责任划分，不承诺赔偿金额。",
    },
    "P2": {
        "actions": ["1 小时内首次响应", "核对工单与账户状态", "给出明确处理时限"],
        "tone": "描述事实、给出动作与时限；避免使用“应该”“可能”这类模糊表述。",
    },
    "P3": {
        "actions": ["按知识库给出标准答复", "必要时升级主管"],
        "tone": "简洁、给路径；不展开内部流程。",
    },
    "P4": {
        "actions": ["自助指引", "记录为体验问题"],
        "tone": "一句话给解决入口。",
    },
}

TEMPLATE = "您好，已收到您反馈的问题。当前处理级别为{level}，首次响应时限{sla}小时，负责人：{owner}。下一步我们会{first_action}，并在{sla}小时内同步进展。"


def main() -> None:
    level = (sys.argv[1] if len(sys.argv) > 1 else "P3").strip().upper()
    tier = (sys.argv[2] if len(sys.argv) > 2 else "B").strip().upper()[:1] or "B"
    if level not in PLAYBOOK:
        level = "P3"
    sla = {"S": 2, "A": 8, "B": 24, "C": 48}.get(tier, 24)
    owner = {"P1": "重大客诉组", "P2": "区域客服主管", "P3": "一线客服", "P4": "自助服务"}[level]
    book = PLAYBOOK[level]
    print(
        json.dumps(
            {
                "level": level,
                "tier": tier,
                "actions": book["actions"],
                "tone": book["tone"],
                "draft": TEMPLATE.format(level=level, sla=sla, owner=owner, first_action=book["actions"][0]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
