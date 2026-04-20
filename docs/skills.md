# Skills 使用与分享

## 安装 Skills

### 从 Git 仓库安装单个 Skill

```bash
npm run dev -- install https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot
```

URL 格式支持：
- 完整 URL: `https://github.com/user/repo.git#path/to/skill`
- 带分支: `https://github.com/user/repo.git#branch:path/to/skill`
- GitHub 简写: `user/repo#path/to/skill`

### 批量安装所有 Skills

```bash
npm run dev -- install --all https://github.com/ouruibin/webfunc-skills.git
```

批量安装时会读取仓库根目录的 `registry.json`，按其中列出的 skills 逐个安装。如果没有 `registry.json`，则扫描目录下的所有 skill 子目录。

### 从本地路径安装

```bash
# 安装单个 skill
npm run dev -- install ./my-skill

# 批量安装本地集合
npm run dev -- install --all ./webfunc-skills
```

### 覆盖已存在的 Skill

```bash
npm run dev -- install --force https://github.com/ouruibin/webfunc-skills.git#skills/zhihu-hot
```

## 查看已安装的 Skills

```bash
npm run dev -- skills list
```

## 分享 Skills

### Skill 格式

Skill 是一个目录，包含：

```
skill-name/
├── skill.json    # 必填，skill 配置
└── README.md     # 可选，使用说明
```

### 创建 Skills 集合仓库

```
webfunc-skills/
├── README.md
├── registry.json
└── skills/
    ├── skill-a/
    │   ├── skill.json
    │   └── README.md
    └── skill-b/
        ├── skill.json
        └── README.md
```

`registry.json` 格式：

```json
{
  "name": "webfunc-skills",
  "version": "1.0.0",
  "skills": [
    {
      "name": "skill-a",
      "version": "1.0.0",
      "description": "描述",
      "directory": "skills/skill-a"
    }
  ]
}
```

## 社区 Skills

- [webfunc-skills](https://github.com/ouruibin/webfunc-skills) — 官方 Skills 集合
