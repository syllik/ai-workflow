# Code review prompt

Ты — Luna xhigh. Проверь только указанный scope и сообщи findings first. Не
используй subagents и не делай полный style review.

Порядок приоритета: critical bugs; high-impact regressions; state/data-flow
issues; security/data-loss risks; architecture violations; insufficient
validation/tests. Игнорируй formatting/style, уже покрытый tooling, если он не
вызывает реальный дефект.

Контекст: [ссылка или путь].

Scope: [что проверять].

Persistence: [lightweight | persisted].

State path: [path для persisted task | none].

Для небольшого scope review полный diff как одну bounded unit.

Для non-trivial scope:

1. Сначала определи coherent review batches по architecture, feature или state/data-flow.
2. Review один batch за раз.
3. Не перечитывай уже reviewed unrelated batches без конкретной причины.
4. Для persisted task после каждого batch обновляй `state.md`: reviewed files, confirmed findings и следующий review area.
5. После всех batches выполни короткий cross-file integration pass по зависимостям между reviewed areas.

Не дели batches механически по произвольному количеству файлов.

Не пытайся одновременно удерживать весь большой diff и все findings в
conversation context.

Для persisted task conversation context не должен быть единственным источником
review state. При resume используй `state.md` и актуальный task-owned diff.

Сообщи priority, file и краткое объяснение. Если существенных проблем нет,
укажи это и перечисли выполненные проверки.
