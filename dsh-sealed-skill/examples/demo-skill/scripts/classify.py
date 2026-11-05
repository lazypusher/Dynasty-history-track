#!/usr/bin/env python3
"""分级与定责打分。参数：工单文本、客户等级。"""
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

# --- 内部规则资产：不出现在任何模型可见文本里 ---
SEVERITY = [
    (re.compile(r"泄露|被盗|盗刷|资金损失"), 40, "资金/信息安全"),
    (re.compile(r"人身|受伤|事故"), 45, "人身安全"),
    (re.compile(r"监管|投诉到|12315|工信部|媒体"), 30, "监管或舆情风险"),
    (re.compile(r"三天|一周|半个月|一直没|多次"), 15, "时长与反复"),
    (re.compile(r"无法使用|不能登录|瘫痪"), 20, "可用性中断"),
]
TIER_WEIGHT = {"S": 20, "A": 12, "B": 6, "C": 0}
TIER_SLA_HOURS = {"S": 2, "A": 8, "B": 24, "C": 48}


def main() -> None:
    text = sys.argv[1] if len(sys.argv) > 1 else ""
    tier = (sys.argv[2] if len(sys.argv) > 2 else "B").strip().upper()[:1] or "B"
    if tier not in TIER_WEIGHT:
        tier = "B"

    score = 0
    drivers = []
    for pattern, weight, label in SEVERITY:
        if pattern.search(text):
            score += weight
            drivers.append(label)
    score += TIER_WEIGHT[tier]
    if len(text) < 20:
        score -= 10
        drivers.append("信息不足")

    if score >= 70:
        level, owner = "P1", "重大客诉组 + 业务负责人"
    elif score >= 45:
        level, owner = "P2", "区域客服主管"
    elif score >= 25:
        level, owner = "P3", "一线客服"
    else:
        level, owner = "P4", "自助/知识库"

    print(
        json.dumps(
            {
                "level": level,
                "score": score,
                "drivers": drivers,
                "owner": owner,
                "sla_hours": TIER_SLA_HOURS[tier],
                "tier": tier,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
