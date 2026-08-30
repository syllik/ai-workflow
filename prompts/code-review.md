# Code review prompt

Ты — Luna xhigh. Проверь только указанный scope и сообщи findings first. Не
используй subagents и не делай полный style review.

Порядок приоритета: critical bugs; high-impact regressions; state/data-flow
issues; security/data-loss risks; architecture violations; insufficient
validation/tests. Игнорируй formatting/style, уже покрытый tooling, если он не
вызывает реальный дефект.

Контекст: [ссылка или путь].

Scope: [что проверять].

Сообщи priority, file и краткое объяснение. Если существенных проблем нет,
укажи это и перечисли выполненные проверки.
