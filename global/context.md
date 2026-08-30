# Global context

Этот repository хранит canonical workflow и минимальный устойчивый context для
нескольких GitHub projects. Фактическое состояние кода всегда находится в
актуальном target repository.

## Постоянные правила

* `FLOW.md` — canonical entry point для Sol.
* `projects/index.md` сопоставляет project context с реальным repository.
* `projects/<project>/context.md` — canonical source of truth устойчивых сведений конкретного проекта.
* `decisions.md` хранит только релевантные устойчивые решения.
* `tasks/` — optional history для persisted tasks, а не обязательный lifecycle.
* Полные dumps разговоров не сохраняются.
* Пользовательские тексты и документация пишутся на русском языке; технические identifiers остаются на английском, если это естественно.
* При создании или обновлении human-facing документации используйте emoji умеренно как визуальные семантические маркеры: они должны помогать быстрее считывать структуру и понимать связь элементов, соответствовать смыслу связанных заголовков, ссылок, действий, статусов или предупреждений и сохранять одинаковую смысловую ассоциацию для одинаковых типов элементов. Предпочитайте осмысленную визуальную связь между emoji и элементом документации; не используйте случайные декоративные emoji и не перегружайте ими текст.
* Secrets, credentials, tokens, private keys и содержимое `.env` не сохраняются.
* Sol отвечает за planning, architecture, research, scope и validation; Luna — за implementation, tests/checks, diff review, commit и разрешённый push.
* Subagents запрещены; повторное исследование и загрузка контекста должны быть минимальными.
