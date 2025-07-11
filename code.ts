figma.showUI(__html__, { width: 400, height: 500 });

interface ImageInfo {
  id: string;
  name: string;
  path: string;
  nodeId: string;
  parentNodeIds: string[];
  parentOriginalNames?: string[];
}

type NamingStrategy = 'suffix' | 'id' | 'merge';

function collectImageNodes(node: BaseNode, parentPath: string = "", parentNodeIds: string[] = [], parentOriginalNames: string[] = [], includeRoot: boolean = false): ImageInfo[] {
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
          parentNodeIds: [...parentNodeIds],
          parentOriginalNames: [...parentOriginalNames]
        });
      }
    }
  }
  
  if ("children" in node) {
    // 只有在includeRoot为true或者不是第一层时才包含当前节点名称
    const currentPath = (includeRoot || parentPath !== "") ? 
      (parentPath ? `${parentPath}/${sanitizeName(node.name)}` : sanitizeName(node.name)) : 
      parentPath;
    const currentNodeIds = (includeRoot || parentNodeIds.length > 0) ? 
      [...parentNodeIds, node.id] : 
      parentNodeIds;
    const currentOriginalNames = (includeRoot || parentOriginalNames.length > 0) ? 
      [...parentOriginalNames, node.name] : 
      parentOriginalNames;
    
    for (const child of node.children) {
      images.push(...collectImageNodes(child, currentPath, currentNodeIds, currentOriginalNames, true));
    }
  }
  
  return images;
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').trim();
}

function findCommonParent(nodes: readonly SceneNode[]): BaseNode | null {
  if (nodes.length === 0) return null;
  
  // 获取第一个节点的所有父节点
  let current = nodes[0].parent;
  const parents: BaseNode[] = [];
  while (current) {
    parents.push(current);
    current = current.parent;
  }
  
  // 找到所有节点都共享的最近父节点
  for (const parent of parents) {
    let allNodesInParent = true;
    for (const node of nodes) {
      let nodeParent = node.parent;
      let found = false;
      while (nodeParent) {
        if (nodeParent === parent) {
          found = true;
          break;
        }
        nodeParent = nodeParent.parent;
      }
      if (!found) {
        allNodesInParent = false;
        break;
      }
    }
    if (allNodesInParent) {
      return parent;
    }
  }
  
  return null;
}

function collectImageNodesFromParent(parent: BaseNode, selectedNodes: readonly SceneNode[], parentPath: string = "", parentNodeIds: string[] = [], parentOriginalNames: string[] = []): ImageInfo[] {
  const images: ImageInfo[] = [];
  const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
  
  function shouldIncludeNode(node: BaseNode): boolean {
    // 检查节点是否是选中节点或其子节点
    if (selectedNodeIds.has(node.id)) return true;
    
    // 检查是否是选中节点的子节点
    for (const selected of selectedNodes) {
      let current: BaseNode | null = node;
      while (current) {
        if (current.id === selected.id) return true;
        current = current.parent;
      }
    }
    
    return false;
  }
  
  function collectFromNode(node: BaseNode, path: string, nodeIds: string[], originalNames: string[], includeInPath: boolean = true): void {
    // 只处理应该包含的节点
    if (!shouldIncludeNode(node)) return;
    
    if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON' || node.type === 'STAR' || node.type === 'VECTOR') {
      const rectNode = node as GeometryMixin;
      if (rectNode.fills && rectNode.fills !== figma.mixed && rectNode.fills.length > 0) {
        const fill = rectNode.fills[0];
        if (fill.type === 'IMAGE') {
          images.push({
            id: node.id,
            name: node.name,
            path: path,
            nodeId: node.id,
            parentNodeIds: [...nodeIds],
            parentOriginalNames: [...originalNames]
          });
        }
      }
    }
    
    if ("children" in node) {
      const currentPath = includeInPath && node !== parent ? 
        (path ? `${path}/${sanitizeName(node.name)}` : sanitizeName(node.name)) : 
        path;
      const currentNodeIds = includeInPath && node !== parent ? 
        [...nodeIds, node.id] : 
        nodeIds;
      const currentOriginalNames = includeInPath && node !== parent ? 
        [...originalNames, node.name] : 
        originalNames;
      
      for (const child of node.children) {
        collectFromNode(child, currentPath, currentNodeIds, currentOriginalNames);
      }
    }
  }
  
  collectFromNode(parent, parentPath, parentNodeIds, parentOriginalNames, false);
  return images;
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
    // 自动添加后缀策略 - 基于原始名称检查同名
    const pathCounts = new Map<string, Map<string, number>>();
    const nameCounts = new Map<string, number>();
    
    for (const imageInfo of imageNodes) {
      const originalNames = imageInfo.parentOriginalNames || [];
      const pathParts = imageInfo.path.split('/').filter(p => p.length > 0);
      const processedParts: string[] = [];
      let parentPath = '';
      
      for (let i = 0; i < pathParts.length; i++) {
        const sanitizedPart = pathParts[i];
        const originalName = originalNames[i] || sanitizedPart;
        
        // 获取或创建当前层级的计数器
        if (!pathCounts.has(parentPath)) {
          pathCounts.set(parentPath, new Map<string, number>());
        }
        const levelCounts = pathCounts.get(parentPath)!;
        
        // 使用原始名称检查同名
        const count = levelCounts.get(originalName) || 0;
        const processedPart = count > 0 ? `${sanitizedPart}_${count}` : sanitizedPart;
        levelCounts.set(originalName, count + 1);
        
        processedParts.push(processedPart);
        parentPath = i < originalNames.length - 1 ? originalNames.slice(0, i + 1).join('/') : processedParts.join('/');
      }
      
      const processedPath = processedParts.join('/');
      
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
      
      // 如果只选择了一个节点，直接处理
      if (selection.length === 1) {
        imageNodes = collectImageNodes(selection[0]);
      } else {
        // 如果选择了多个节点，找到它们的共同父节点
        const commonParent = findCommonParent(selection);
        if (commonParent) {
          // 从共同父节点开始收集，但只包含选中的节点
          imageNodes = collectImageNodesFromParent(commonParent, selection);
        } else {
          // 如果没有共同父节点，分别处理每个节点
          for (const selectedNode of selection) {
            imageNodes.push(...collectImageNodes(selectedNode));
          }
        }
      }
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