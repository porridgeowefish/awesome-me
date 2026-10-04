# 素材与依赖

演示头像、Logo、像素角色、背景、三张图库插画与内容流程图由 `tools/scripts/generate-demo-assets.mjs` 绘制。示例提示音由同一脚本合成，不来自歌曲录音。使用指南和虚构资料为本项目编写。上述原创内容采用根目录 MIT 许可证。

重建演示媒体：

```powershell
node tools/scripts/generate-demo-assets.mjs
```

该命令覆盖项目内同名示例媒体；已在后台上传的媒体存于私有数据目录，不受影响。公开派生图均不保留 EXIF。

第三方依赖的名称与版本记录在 `package-lock.json`，依赖按各自许可证提供。FFmpeg 为外部音频处理程序，受其自身许可证约束，不作为本项目 MIT 代码授权；其平台二进制通过安装依赖或系统包获取，不提交到源码仓库。
