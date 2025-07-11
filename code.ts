figma.showUI(__html__, { width: 400, height: 500 });

interface ImageInfo {
  id: string;
  name: string;
  path: string;
  nodeId: string;
  parentNodeIds: string[];
}

type NamingStrategy = 'suffix' | 'id' | 'merge';

function collectImageNodes(node: BaseNode, parentPath: string = "", parentNodeIds: string[] = []): ImageInfo[] {
  const images: ImageInfo[] = [];
  
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'VECTOR') {
    const rectNode = node as GeometryMixin;
    if (rectNode.fills && rectNode.fills !== figma.mixed && rectNode.fills.length > 0) {
      const fill = rectNode.fills[0];
      if (fill.type === 'IMAGE') {
        images.push({
          id: node.id,
          name: node.name,
          path: parentPath,
          nodeId: node.id,
          parentNodeIds: [...parentNodeIds]
        });
      }
    }
  }
  
  if ("children" in node) {
    const currentPath = parentPath ? `${parentPath}/${sanitizeName(node.name)}` : sanitizeName(node.name);
    const currentNodeIds = [...parentNodeIds, node.id];
    for (const child of node.children) {
      images.push(...collectImageNodes(child, currentPath, currentNodeIds));
    }
  }
  
  return images;
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').trim();
}

function processExports(imageNodes: ImageInfo[], strategy: NamingStrategy): { processedPath: string; imageName: string; imageInfo: ImageInfo }[] {
  const result: { processedPath: string; imageName: string; imageInfo: ImageInfo }[] = [];
  
  if (strategy === 'id') {
    // 使用节点ID策略
    for (const imageInfo of imageNodes) {
      const pathParts = imageInfo.parentNodeIds.map(id => id);
      const processedPath = pathParts.join('/');
      const imageName = imageInfo.nodeId;
      result.push({ processedPath, imageName, imageInfo });
    }
  } else if (strategy === 'suffix') {
    // 自动添加后缀策略
    const pathCounts = new Map<string, Map<string, number>>();
    const nameCounts = new Map<string, number>();
    
    for (const imageInfo of imageNodes) {
      let processedPath = imageInfo.path;
      
      // 处理路径中的每个部分，检查是否需要添加后缀
      const pathParts = processedPath.split('/').filter(p => p.length > 0);
      const processedParts: string[] = [];
      let parentPath = '';
      
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        
        // 获取或创建当前层级的计数器
        if (!pathCounts.has(parentPath)) {
          pathCounts.set(parentPath, new Map<string, number>());
        }
        const levelCounts = pathCounts.get(parentPath)!;
        
        // 检查同级是否有同名文件夹
        const count = levelCounts.get(part) || 0;
        const processedPart = count > 0 ? `${part}_${count}` : part;
        levelCounts.set(part, count + 1);
        
        processedParts.push(processedPart);
        parentPath = processedParts.join('/');
      }
      
      processedPath = processedParts.join('/');
      
      // 处理图片名称
      const nameKey = `${processedPath}/${imageInfo.name}`;
      const nameCount = nameCounts.get(nameKey) || 0;
      const imageName = nameCount > 0 ? `${sanitizeName(imageInfo.name)}_${nameCount}` : sanitizeName(imageInfo.name);
      nameCounts.set(nameKey, nameCount + 1);
      
      result.push({ processedPath, imageName, imageInfo });
    }
  } else {
    // merge策略 - 合并同名文件夹
    const nameCounts = new Map<string, number>();
    
    for (const imageInfo of imageNodes) {
      const processedPath = imageInfo.path;
      
      // 只处理同名图片文件
      const nameKey = `${processedPath}/${imageInfo.name}`;
      const nameCount = nameCounts.get(nameKey) || 0;
      const imageName = nameCount > 0 ? `${sanitizeName(imageInfo.name)}_${nameCount}` : sanitizeName(imageInfo.name);
      nameCounts.set(nameKey, nameCount + 1);
      
      result.push({ processedPath, imageName, imageInfo });
    }
  }
  
  return result;
}

async function exportImageNode(node: BaseNode, processedPath: string, imageName: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (!("exportAsync" in node)) {
    return null;
  }
  
  try {
    const bytes = await (node as any).exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }
    });
    
    const fileName = processedPath ? `${processedPath}/${imageName}.png` : `${imageName}.png`;
    
    return { name: fileName, bytes };
  } catch (error) {
    console.error(`Error exporting node ${node.name}:`, error);
    return null;
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-hierarchy') {
    const namingStrategy = msg.namingStrategy as NamingStrategy || 'suffix';
    const exportAll = msg.exportAll || false;
    
    let imageNodes: ImageInfo[] = [];
    
    if (exportAll) {
      // 导出当前页面的所有图片
      imageNodes = collectImageNodes(figma.currentPage);
    } else {
      // 导出选中节点的图片
      const selection = figma.currentPage.selection;
      
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: '请先选择一个节点，或勾选"导出当前页面的所有图片"'
        });
        return;
      }
      
      const selectedNode = selection[0];
      imageNodes = collectImageNodes(selectedNode);
    }
    
    if (imageNodes.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: exportAll ? '当前页面中没有找到图片资源' : '选中的节点中没有找到图片资源'
      });
      return;
    }
    
    // 处理导出路径和名称
    const processedExports = processExports(imageNodes, namingStrategy);
    
    figma.ui.postMessage({
      type: 'export-start',
      total: processedExports.length
    });
    
    const exports: { name: string; bytes: Uint8Array }[] = [];
    let completed = 0;
    
    for (const { processedPath, imageName, imageInfo } of processedExports) {
      const node = figma.getNodeById(imageInfo.id);
      if (node) {
        const exportData = await exportImageNode(node, processedPath, imageName);
        if (exportData) {
          exports.push(exportData);
        }
      }
      
      completed++;
      figma.ui.postMessage({
        type: 'export-progress',
        completed,
        total: processedExports.length
      });
    }
    
    figma.ui.postMessage({
      type: 'export-complete',
      exports: exports
    });
  }
  
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};