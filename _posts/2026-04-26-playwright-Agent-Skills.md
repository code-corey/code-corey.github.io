---
title: "从“能写代码”到“能操作网页”：Playwright CLI + Skills，打造真正的 AI 程序员"
date: 2026-04-26 19:35
tags: [Playwright CLI,Skills]
description: "从“能写代码”到“能操作网页”：Playwright CLI + Skills，打造真正的 AI 程序员"
---



# 从“能写代码”到“能操作网页”：Playwright CLI + Skills，打造真正的 AI 程序员

如果你还在让 AI 帮你写自动化脚本，那你还停留在 AI 编程的 1.0 时代。

真正的 2.0 时代，是你告诉 AI：“去把这个网页的登录流程测一下，有问题就截个图发给我”，然后 AI 自己打开浏览器、点击、输入、校验、生成报告。

这不是科幻。这是 `playwright-cli` + **Skills** 架构正在做的事情。

本文将深入讲解这套技术栈如何让 AI 从“代码生成器”进化为“真正的智能体”。


## 一、痛点：为什么 AI 写的自动化脚本总是不靠谱？

在接触 Skills 之前，大多数开发者尝试 AI 生成自动化脚本的体验是这样的：

1.  **幻觉选择器（Hallucinated Locators）**：AI 凭“记忆”编造了一个 CSS 选择器 `div.container > ul > li:nth-child(3) > a`，但页面的实际结构早就变了 。
2.  **脱离架构（Convention Ignorance）**：生成的代码全是 `page.click()` 的硬编码，完全没有遵循你们团队的 Page Object Model（POM）架构，导致代码无法维护 。
3.  **脆弱的修复（Fragile Output）**：脚本一跑就挂，AI 只会盲目重试，而不是分析原因。

**核心问题在于**：传统的 AI 编程助手没有“视觉”，也不懂“规矩”。它只能基于训练数据给建议，无法基于你的**真实运行环境**和**团队规范**去行动。

## 二、核心武器：Playwright CLI 与 Skills

为了解决上述问题，我们需要引入两样利器。

### 1. Playwright CLI：AI 的手和眼

你可能熟悉 Playwright 这个自动化框架，但 `@playwright/cli` 是一个全新的物种。它不是一个写脚本的库，而是一个**专为 AI 智能体设计的浏览器操作命令行接口（CLI）**。

它允许 AI 像使用 Linux 命令一样操作浏览器：

```bash
playwright-cli open https://example.com
playwright-cli snapshot        # 获取页面可访问性树，找到元素引用
playwright-cli click @e12      # 点击编号为 e12 的元素
playwright-cli type "Hello"    # 输入文本
playwright-cli screenshot      # 截图保存
```

**为什么不用 MCP (Model Context Protocol)？** 官方的文档指出，CLI 方案相比 MCP 更节省 Token 。CLI 将快照和截图保存在磁盘文件上，只返回文件路径给 AI，而不是把庞大的图片 Base64 数据或复杂的 DOM 树塞进上下文。这让 AI 能腾出空间去思考更复杂的逻辑。

### 2. Skills：AI 的大脑和规矩

如果说 CLI 是 AI 的“手”，那么 **Skills** 就是 AI 的“大脑”和“企业章程”。

Skills 是 Anthropic 开源的一种技术规范。它本质上是一个 **Markdown 文件**（如 `SKILL.md`），存放在你的项目目录中 。这个文件不是给程序员看的文档，而是给 AI  Agent 执行的**指令集**和**约束集**。

一个标准的 Playwright Skill 包含：
- **方法论（Methodology）**：必须使用三层 POM 结构、命名规范。
- **参考范例（Examples）**：完美的 Page Object 代码样本。
- **验证清单（Checklist）**：生成的代码必须通过的自检规则（如：不能出现硬编码 URL、必须包含截图步骤）。

## 三、实战演练：Agent 驱动的测试全流程

我们以 **“测试 TodoMVC 的添加功能”** 为例，看看 AI Agent是如何工作的。

### Step 1: 注入技能

首先你需要安装 CLI 并把 Skill 植入到你的 AI 环境中。

```bash
# 安装 CLI
npm install -g @playwright/cli@latest

# 为 Claude Code 安装 Skill (这会告诉 Claude 如何写代码)
playwright-cli install --skills
# 或者手动克隆官方技能库
git clone https://github.com/LambdaTest/agent-skills.git
cp -r agent-skills/playwright-skill .claude/skills/ 
```

现在，你的 AI 就已经具备了“高级自动化工程师”的知识储备。

### Step 2: Recon（侦察）—— 拒绝幻觉

你发出指令：“使用 playwright 技能，测试 https://demo.playwright.dev/todomvc/ 的新增待办功能。”

AI 的第一步不是写代码，而是**侦察（Recon）**：
1.  AI 在终端执行：`playwright-cli open https://demo.playwright.dev/todomvc/ --headed`（打开浏览器）。
2.  AI 执行：`playwright-cli snapshot`。
3.  系统返回一个 `.yml` 文件，内容类似：
    ```yaml
    - textbox "New Todo" [ref=e1]
    - button "" [ref=e2] (作用：新增)
    ```
4.  AI 读取了这个快照，它**看到了**真实的页面结构，知道了输入框的引用是 `e1`，按钮的引用是 `e2` 。

**关键点**：AI 没有编造选择器，它是通过 CLI 实时抓取到的。

### Step 3: Generate（生成）—— 注入规范

AI 开始写代码。因为 Skill 的存在，它不会生成原始的 `page.fill`，而是生成符合你团队规范的代码：

```javascript
// 注意：AI 严格按照 Skill 中的命名规范和 POM 结构生成代码
class TodoPage {
    constructor(page) { this.page = page; }
    async addTodo(text) {
        await this.page.getByPlaceholder('New Todo').fill(text);
        await this.page.keyboard.press('Enter');
        // 根据 Skill 规则，这里必须包含截图
        await this.page.screenshot({ path: 'add_todo.png' });
    }
}
```

### Step 4: Run & Heal（运行与自愈）

AI 运行测试。如果失败了（例如页面加载慢了，或者弹出了广告遮挡），AI 不会只是报错。
它会进入**自愈循环（Heal Loop）** ：

1.  捕获错误：`TimeoutError: waiting for selector "text=New Todo" failed`。
2.  重新侦察：再次运行 `playwright-cli snapshot`，发现输入框其实存在，只是页面焦点没在输入框上。
3.  执行修复：AI 修改代码，在 `fill` 之前增加一步 `click` 操作来聚焦。
4.  重试：运行修复后的代码，直到通过。

## 四、1+1>2：为什么这套架构是未来的趋势？

通过上面的案例，你可以看到 **CLI + Skills** 的组合解决了 AI 自动化中的三大核心矛盾：

1.  **准确性与幻觉的矛盾**：
    -   **Before**：AI 凭记忆写 `#app > div > h1`。
    -   **After**：AI 通过 `snapshot` 拿真实的 `ref=e1`。
    -   准确性从 60% 提升至 99% 。

2.  **通用性与规范的矛盾**：
    -   **Before**：每个 AI 生成的代码风格都不一样，难以维护。
    -   **After**：Skill 就像一本员工手册，AI 必须遵守。只要更新 `SKILL.md` 文件，所有后续生成的代码都会自动符合新规范 。

3.  **Token 消耗与性能的矛盾**：
    -   **Before**：MCP 协议可能会把整个页面的可访问性树（非常大）塞进上下文，消耗大量 Token。
    -   **After**：CLI 将结果存为文件，AI 只操作文件路径，极大降低了成本 。

## 五、进阶：从单一任务到复杂工作流

当你的 AI 掌握了这套能力，它能做的事情就远远不止跑测试了。你可以构建跨系统的**智能体工作流**：

1.  **工作流定义**：创建一个 `SKILL.md`，定义“早报新闻采集流程”。
2.  **Agent 执行**：
    -   Agent 调用 CLI 打开新闻网站。
    -   Agent 提取头条标题和链接。
    -   Agent 调用大模型 API 总结内容。
    -   Agent 再次调用 CLI，打开公司内部 CMS 系统，自动登录并发布这篇文章 。

这种 **RPA（机器人流程自动化）+ AI** 的模式，让 AI 变成了真正的数字员工。

## 六、如何开始搭建？

你可以参考以下路径快速落地这套技术栈：

1.  **环境准备**：确保 Node.js 18+，安装 `@playwright/cli` 和 `playwright` 浏览器。
2.  **选择智能体**：
    -   如果你使用 `Claude Code`：直接运行 `claude mcp add playwright npx @playwright/mcp@latest` 来获得浏览器控制能力 。
    -   社区方案：也可以使用开源的 `ClawBot Plus` 等方案，它们内置了完整的 Computer Agent 能力 。
3.  **植入 Skills**：
    -   克隆官方的 `agent-skills` 仓库。
    -   将 `playwright-skill` 复制到你的项目目录（如 `.claude/skills/` 或 `.cursor/skills/`）。
4.  **试行**：
    -   尝试对你的 AI 说：“使用 Playwright 打开百度，搜索今天的新闻，并把第一条结果截图给我。”

## 结语

如果说去年我们还在教 AI “如何写代码”，那么今年我们正在教 AI “如何像人一样使用电脑”。

**Playwright CLI** 给了 AI 操作浏览器的手脚，而 **Skills** 给了 AI 遵循企业规范的大脑。

这套组合拳正在让“提示词工程师”这个岗位变得过时，取而代之的是 **“AI 工作流设计师”**。你的任务不再是写胶水代码，而是写 `SKILL.md`——即教 AI 如何思考的说明书。

现在就开始吧，让你的 AI 从对话框里走出来，真正地去浏览网页、点击按钮、完成任务。