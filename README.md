# Figma图片资源导出插件

这个插件可以导出Figma中选中节点下的所有图片资源，并保持原有的文件夹层级结构。

## 功能特点

- 只导出图片资源（IMAGE类型的填充）
- 自动过滤非图片节点（文字、形状等）
- 保持原有的文件夹层级结构
- 批量导出为PNG格式
- 自动打包成ZIP文件下载
- 支持导出当前页面所有图片（无需选择节点）
- 三种同名文件处理策略：
  - **自动添加后缀**：同名文件夹和图片自动添加 _1, _2 等后缀
  - **使用节点ID**：使用Figma节点ID作为文件夹和图片名称
  - **合并同名**：同名文件夹合并，只对同名图片添加后缀

## 安装步骤

1. 安装依赖：
```bash
npm install
```

2. 构建插件：
```bash
npm run build
```

3. 在Figma中加载插件：
   - 打开Figma桌面版
   - 进入菜单 Plugins > Development > Import plugin from manifest
   - 选择 `manifest.json` 文件

## 使用方法

### 导出选中节点的图片
1. 在Figma中选择要导出的节点
2. 运行插件（Plugins > Development > Hierarchy Export）
3. 选择同名处理方式
4. 点击"开始导出"按钮
5. 等待导出完成，文件将自动下载为ZIP包

### 导出当前页面所有图片
1. 运行插件（无需选择任何节点）
2. 勾选"导出当前页面的所有图片"
3. 选择同名处理方式
4. 点击"开始导出"按钮
5. 等待导出完成，文件将自动下载为ZIP包

## 导出文件结构示例

假设你的Figma设计结构如下：
- RootGroup
  - ItemBag (Group)
    - item1 (Image)
    - item2 (Image)
  - Icons (Group)
    - icon1 (Image)
    - SubIcons (Group)
      - icon2 (Image)

导出的ZIP文件结构将是：
```
figma-export.zip
├── RootGroup/
│   ├── ItemBag/
│   │   ├── item1.png
│   │   └── item2.png
│   └── Icons/
│       ├── icon1.png
│       └── SubIcons/
│           └── icon2.png
```

## 开发调试

监听文件变化并自动构建：
```bash
npm run watch
```