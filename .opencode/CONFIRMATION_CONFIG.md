关闭 opencode 的“继续确认”用的是这个项目文件：`.opencode/opencode.json`

对应配置项：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "doom_loop": "allow"
  }
}
```

说明：

- `doom_loop` 就是 opencode 用来防止代理无限自循环时触发的确认权限
- 默认常见值是 `ask`，所以会反复要求你确认是否继续
- 改成 `allow` 后，这类“继续执行”的确认会自动放行

常用可选值：

- `"ask"`: 每次询问你确认
- `"allow"`: 自动允许继续
- `"deny"`: 直接拒绝继续

当前项目里已经写入：

- 文件：`.opencode/opencode.json`
- 配置项：`"permission": { "doom_loop": "allow" }`

如果以后你想手动改回去，直接编辑这个文件即可。
