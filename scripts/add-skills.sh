npx skills@latest add https://github.com/mattpocock/skills \
    $(: 被依赖的 Skill) \
    --skill "grilling" $(: 研讨原语) \
    --skill "domain-modeling" $(: 领域建模原语, 关联 CONTEXT.md 和 ADR 目录) \
    --skill "codebase-design" $(: 接口设计) \
    $(: grill) \
    --skill "grill-me" \
    --skill "handoff" \
    --skill "to-questionnaire" $(: 用户调用) \
    --skill "prototype" $(: UI原型原语) \
    $(: workflow) \
    --skill "grill-with-docs" $(: specify and clarify) \
    --skill "to-spec" $(: like plan and task) \
    --skill "tdd" $(: implement) \
    --skill "code-review" $(: implement) \
    --skill "improve-codebase-architecture" $(: implement) \
    --skill "implement" $(: implement) \
    $(: misc) \
    --skill "resolving-merge-conflicts" \
    $(: 激进试用) \
    --skill "teach" \
    --skill "wayfinder" \
    $(: 指定智能体) \
    --agent "claude-code" --agent "codex" --agent "opencode" -y

npx skills@latest add https://github.com/leonxlnx/taste-skill --skill "design-taste-frontend" --agent "claude-code" --agent "codex" --agent "opencode" -y
npx skills@latest add https://github.com/anthropics/skills --skill "frontend-design" --agent "claude-code" --agent "codex" --agent "opencode" -y
npx skills@latest add https://github.com/vercel-labs/agent-skills --skill "vercel-react-best-practices" --skill "vercel-react-native-skills" --skill "vercel-react-view-transitions" --skill "vercel-composition-patterns" --agent "claude-code" --agent "codex" --agent "opencode" -y # 是 Vercel 沉淀的 React skill

npx skills@latest add https://github.com/DietrichGebert/ponytail/ --skill "ponytail" --skill "ponytail-review" --agent "claude-code" --agent "codex" --agent "opencode" -y
