import type { PromptItem } from '@/utils/types';
import { browser } from '#imports';
import { DEFAULT_CATEGORY_ID, BROWSER_STORAGE_KEY } from '@/utils/constants'; // Import DEFAULT_CATEGORY_ID and BROWSER_STORAGE_KEY
import { generatePromptId } from '@/utils/promptUtils'; // Import generatePromptId

// 存储 Notion Database 中真实的标题属性名称
let notionDatabaseTitlePropertyName: string = 'Title'; // 默认为 "Title"

// 添加获取数据库标题属性名称的函数
export const getNotionDatabaseTitlePropertyName = async (): Promise<string> => {
  // 由于这个值目前只存在内存中，直接返回变量
  // 如果将来需要持久化，可以考虑存入 storage
  return notionDatabaseTitlePropertyName;
};

// 获取已保存的 Notion API 密钥
export const getNotionApiKey = async (): Promise<string | null> => {
  try {
    const result = await browser.storage.sync.get('notionApiKey');
    return result.notionApiKey || null;
  } catch (error) {
    console.error('Error retrieving Notion API key:', error);
    return null;
  }
};

// 获取已保存的 Notion 数据库 ID
export const getDatabaseId = async (): Promise<string | null> => {
  try {
    const result = await browser.storage.sync.get('notionDatabaseId');
    return result.notionDatabaseId || null;
  } catch (error) {
    console.error('Error retrieving Notion database ID:', error);
    return null;
  }
};

// 检查 Notion 同步是否启用
export const isSyncEnabled = async (): Promise<boolean> => {
  try {
    const result = await browser.storage.sync.get(['notionSyncToNotionEnabled']);
    return !!result.notionSyncToNotionEnabled;
  } catch (error) {
    console.error('Error checking Notion sync status:', error);
    return false;
  }
};

interface NotionPageProperty {
  id: string;
  type: string;
  [key: string]: any; // 用于其他属性类型，如 title, rich_text 等
}

interface NotionDatabaseSchema {
  properties: Record<string, NotionPageProperty>;
  // 如果需要，添加其他与 schema 相关的字段
}

interface NotionQueryResponse {
  results: any[];
  next_cursor?: string;
  // 如果需要，添加其他响应字段
}

// 获取 Notion 数据库的结构信息
export const fetchNotionDatabaseSchema = async (apiKey: string, databaseId: string): Promise<NotionDatabaseSchema | null> => {
  try {
    const response: Response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const errorData: any = await response.json();
      console.error(`Error fetching Notion database schema (${response.status}):`, errorData);
      throw new Error(`Failed to fetch database schema: ${errorData.message || response.status}`);
    }
    const schema: NotionDatabaseSchema = await response.json();
    
    // 尝试找到类型为 'title' 的属性的名称
    let titlePropName = 'Title'; // 默认值
    if (schema && schema.properties) {
      for (const propName in schema.properties) {
        if (schema.properties[propName].type === 'title') {
          titlePropName = propName;
          break;
        }
      }
    }
    notionDatabaseTitlePropertyName = titlePropName; // 更新全局变量
    console.log('Successfully fetched Notion database schema. Title property name:', titlePropName);
    return schema;
  } catch (error) {
    console.error('Error in fetchNotionDatabaseSchema:', error);
    return null;
  }
};

// 新增：检查并更新数据库结构，确保所有所需字段都存在
export const ensureDatabaseStructure = async (apiKey: string, databaseId: string): Promise<boolean> => {
  try {
    // 首先获取当前数据库结构
    const schema = await fetchNotionDatabaseSchema(apiKey, databaseId);
    if (!schema) {
      console.error('Cannot update database structure without schema');
      return false;
    }

    const properties = schema.properties || {};
    const requiredFields: {[key: string]: {type: string, options?: any}} = {
      // 注意：标题字段不需要添加，因为Notion数据库必须有一个标题字段
      'Content': { type: 'rich_text' },
      'Tags': { type: 'multi_select' },
      'Enabled': { type: 'checkbox' },
      'PromptID': { type: 'rich_text' },
      'CategoryID': { type: 'rich_text' },
      'Notes': { type: 'rich_text' },
      'LastModified': { type: 'rich_text' }
    };

    // 确定哪些字段需要添加
    const missingFields: Record<string, any> = {};
    let hasMissingFields = false;

    for (const [fieldName, fieldConfig] of Object.entries(requiredFields)) {
      if (!properties[fieldName]) {
        console.log(`Field "${fieldName}" missing in database, will add it.`);
        missingFields[fieldName] = {
          [fieldConfig.type]: fieldConfig.options || {}
        };
        hasMissingFields = true;
      } else if (properties[fieldName].type !== fieldConfig.type) {
        console.warn(`Field "${fieldName}" exists but has wrong type: ${properties[fieldName].type} (expected: ${fieldConfig.type})`);
        // 实际应用中，可能需要在此处添加处理类型不匹配的逻辑
      }
    }

    // 如果没有缺失字段，直接返回成功
    if (!hasMissingFields) {
      console.log('All required database fields are present.');
      return true;
    }

    // 更新数据库，添加缺失的字段
    console.log('Updating database structure to add missing fields:', Object.keys(missingFields));
    const updateResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: missingFields
      })
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('Failed to update database structure:', errorData);
      throw new Error(`Failed to update database: ${errorData.message || updateResponse.status}`);
    }

    const updatedSchema = await updateResponse.json();
    console.log('Successfully updated database structure. Added fields:', Object.keys(missingFields));
    return true;
  } catch (error) {
    console.error('Error ensuring database structure:', error);
    return false;
  }
};

// 从 Notion 数据库获取所有 Prompt
// 返回 PromptItem 数组或在出错时返回 null
export const fetchNotionPrompts = async (apiKey: string, databaseId: string): Promise<PromptItem[] | null> => {
  try {
    const schema = await fetchNotionDatabaseSchema(apiKey, databaseId);
    if (!schema) {
      console.error('Cannot fetch Notion prompts without database schema.');
      return null;
    }
    const titlePropName = notionDatabaseTitlePropertyName;

    let allResults: any[] = [];
    let nextCursor: string | undefined = undefined;

    do {
      const response: Response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start_cursor: nextCursor }),
      });

      if (!response.ok) {
        const errorData: any = await response.json();
        console.error('Error querying Notion database:', errorData);
        throw new Error(`Failed to query database: ${errorData.message || response.status}`);
      }

      const data: NotionQueryResponse = await response.json();
      allResults = allResults.concat(data.results);
      nextCursor = data.next_cursor;
    } while (nextCursor);

    console.log(`Fetched ${allResults.length} pages from Notion.`);

    return allResults.map((page: any) => {
      const props = page.properties;
      const title = props[titlePropName]?.title?.[0]?.plain_text?.trim() || 'Untitled';
      const content = props.Content?.rich_text?.[0]?.plain_text?.trim() || '';
      const tags = props.Tags?.multi_select?.map((tag: {name: string}) => tag.name) || [];
      const promptId = props.PromptID?.rich_text?.[0]?.plain_text?.trim() || generatePromptId(title, content, tags);
      const enabled = props.Enabled?.checkbox === undefined ? true : props.Enabled.checkbox;
      const notes = props.Notes?.rich_text?.[0]?.plain_text?.trim() || '';
      const lastModified = props.LastModified?.rich_text?.[0]?.plain_text?.trim() || new Date().toISOString();

      return {
        id: promptId,
        notionPageId: page.id,
        title,
        content,
        tags,
        enabled,
        categoryId: props.CategoryID?.rich_text?.[0]?.plain_text?.trim() || DEFAULT_CATEGORY_ID, // 分配 categoryId
        notes: notes || undefined, // 只在有内容时设置
        lastModified,
      } as PromptItem;
    });
  } catch (error) {
    console.error('Error fetching prompts from Notion:', error);
    return null;
  }
};

// 将 Notion 的 Prompts 同步到本地存储
export const syncPromptsFromNotion = async (mode: 'replace' | 'append' = 'replace'): Promise<boolean> => {
  console.log(`Starting sync from Notion to local storage (mode: ${mode})`);
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();

  if (!apiKey || !databaseId) {
    console.error('Notion API key or Database ID is missing. Cannot sync from Notion.');
    return false;
  }

  try {
    // 首先确保数据库结构完整
    console.log('Checking and updating database structure if needed...');
    const structureUpdated = await ensureDatabaseStructure(apiKey, databaseId);
    if (!structureUpdated) {
      console.error('Failed to ensure database structure. Sync may fail if required fields are missing.');
      // 继续同步，但可能会失败
    }
    
    const notionPrompts = await fetchNotionPrompts(apiKey, databaseId);
    if (notionPrompts === null) {
      console.error('Failed to fetch prompts from Notion. Aborting sync from Notion.');
      return false; // 获取失败，则不继续
    }
    
    console.log(`Fetched ${notionPrompts.length} prompts from Notion.`);

    const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    let localPrompts: PromptItem[] = localPromptsResult[BROWSER_STORAGE_KEY] || [];
    console.log(`Found ${localPrompts.length} prompts locally before sync.`);

    let newLocalPrompts: PromptItem[];

    if (mode === 'replace') {
      console.log('Sync mode: replace. Replacing all local prompts with Notion prompts.');
      newLocalPrompts = notionPrompts;
    } else { // append mode
      console.log('Sync mode: append. Merging Notion prompts with local prompts.');
      const localPromptIds = new Set(localPrompts.map(p => p.id));
      const promptsToAppend = notionPrompts.filter(np => !localPromptIds.has(np.id));
      newLocalPrompts = [...localPrompts, ...promptsToAppend];
      console.log(`Appending ${promptsToAppend.length} new prompts from Notion.`);
    }
    
    // 更新本地存储
    const dataToStore: Record<string, any> = {};
    dataToStore[BROWSER_STORAGE_KEY] = newLocalPrompts;
    await browser.storage.local.set(dataToStore);
    
    console.log(`Successfully synced ${newLocalPrompts.length} prompts from Notion to local storage (mode: ${mode}).`);
    return true;
  } catch (error) {
    console.error('Error during sync from Notion:', error);
    return false;
  }
};


// --- Functions for Syncing Local to Notion ---

async function createNotionPage(prompt: PromptItem, apiKey: string, databaseId: string, titlePropName: string): Promise<string | null> {
  console.log(`Creating new Notion page for "${prompt.title}" (ID: ${prompt.id})`);
  try {
    const properties: any = {
      [titlePropName]: { title: [{ text: { content: prompt.title } }] },
      'Content': { rich_text: [{ text: { content: prompt.content || "" } }] },
      'Tags': { multi_select: prompt.tags?.map(tag => ({ name: tag })) || [] },
      'PromptID': { rich_text: [{ text: { content: prompt.id || generatePromptId(prompt.title, prompt.content, prompt.tags) } }] },
      'CategoryID': { rich_text: [{ text: { content: prompt.categoryId || DEFAULT_CATEGORY_ID } }] },
      'Enabled': { checkbox: prompt.enabled === undefined ? true : !!prompt.enabled }, // 确保是布尔值
      'Notes': { rich_text: [{ text: { content: prompt.notes || "" } }] },
      'LastModified': { rich_text: [{ text: { content: prompt.lastModified || new Date().toISOString() } }] }
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      console.error(`Error creating Notion page for "${prompt.title}":`, errorData);
      throw new Error(`Failed to create page: ${errorData.message || response.status}`);
    }
    const pageData: any = await response.json();
    console.log(`Successfully created Notion page for "${prompt.title}", Page ID: ${pageData.id}`);
    return pageData.id; // 返回新创建的 Notion Page ID
  } catch (error) {
    console.error(`Error in createNotionPage for "${prompt.title}":`, error);
    return null;
  }
}

async function updateNotionPage(notionPageId: string, prompt: PromptItem, apiKey: string, databaseId: string, titlePropName: string): Promise<{success: boolean, error?: string}> {
  console.log(`Updating Notion page ${notionPageId} for "${prompt.title}" (ID: ${prompt.id})`);
  try {
    const properties: any = {
      [titlePropName]: { title: [{ text: { content: prompt.title } }] },
      'Content': { rich_text: [{ text: { content: prompt.content || "" } }] },
      'Tags': { multi_select: prompt.tags?.map(tag => ({ name: tag })) || [] },
      // PromptID 通常不应更改，因此我们不在此处更新它。
      // 如果 CategoryID 可以更改，则应在此处更新。
      'CategoryID': { rich_text: [{ text: { content: prompt.categoryId || DEFAULT_CATEGORY_ID } }] },
      'Enabled': { checkbox: prompt.enabled === undefined ? true : !!prompt.enabled }, // 确保是布尔值
      'Notes': { rich_text: [{ text: { content: prompt.notes || "" } }] },
      'LastModified': { rich_text: [{ text: { content: prompt.lastModified || new Date().toISOString() } }] }
    };

    const response = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      console.error(`Error updating Notion page ${notionPageId} for "${prompt.title}":`, errorData);
      const errorMessage = `Failed to update page: ${errorData.message || response.status}`;
      throw new Error(errorMessage);
    }
    console.log(`Successfully updated Notion page ${notionPageId} for "${prompt.title}"`);
    return {success: true};
  } catch (error: any) {
    const errorMessage = error.message || `更新 "${prompt.title}" 时发生未知错误`;
    console.error(`Error in updateNotionPage for "${prompt.title}" (Page ID: ${notionPageId}):`, error);
    return {success: false, error: errorMessage};
  }
}

async function archiveNotionPage(notionPageId: string, apiKey: string): Promise<boolean> {
  try {
    const response: Response = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ archived: true }),
    });
    if (!response.ok) {
      const errorData: any = await response.json();
      console.error(`Error archiving Notion page ${notionPageId}:`, errorData);
      throw new Error(`Failed to archive page: ${errorData.message || response.status}`);
    }
    console.log(`Successfully archived Notion page ${notionPageId}`);
    return true;
  } catch (error) {
    console.error(`Error in archiveNotionPage for Page ID ${notionPageId}:`, error);
    return false;
  }
}


// 将本地 Prompts 同步到 Notion
export const syncPromptsToNotion = async (localPrompts: PromptItem[]): Promise<{success: boolean, errors?: string[]}> => {
  console.log('Starting sync from local storage to Notion...');
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();
  const errors: string[] = [];

  if (!apiKey || !databaseId) {
    console.error('Notion API key or Database ID is not configured.');
    return {success: false, errors: ['Notion API密钥或数据库ID未配置。']};
  }
  
  console.log('Checking and updating database structure if needed...');
  const structureOk = await ensureDatabaseStructure(apiKey, databaseId);
  if (!structureOk) {
    console.error('Failed to ensure database structure. Aborting sync to Notion.');
    return {success: false, errors: ['无法确保Notion数据库结构完整，无法同步。']};
  }
  // 潜在更新后重新获取 schema 以获得正确的标题属性名称
  const schema = await fetchNotionDatabaseSchema(apiKey, databaseId);
  if (!schema) {
      console.error('Cannot sync to Notion without database schema (even after attempting to ensure structure).');
      return {success: false, errors: ['无法获取Notion数据库结构，无法同步。']};
  }
  const titlePropName = notionDatabaseTitlePropertyName; // 这个值由 fetchNotionDatabaseSchema 更新

  try {
    const notionPrompts = await fetchNotionPrompts(apiKey, databaseId);
    if (notionPrompts === null) {
      console.error('Failed to fetch existing prompts from Notion. Aborting sync.');
      return {success: false, errors: ['无法从Notion获取现有提示词，无法同步。']};
    }

    const notionPromptsMapById: Map<string, any> = new Map();
    notionPrompts.forEach(p => {
      if (p.id) notionPromptsMapById.set(p.id, p); // 假设 p.id 是 Notion 中的 PromptID
    });
    console.log(`Found ${notionPromptsMapById.size} prompts in Notion with a PromptID.`);

    const localPromptsMapById: Map<string, PromptItem> = new Map();
    localPrompts.forEach(p => localPromptsMapById.set(p.id, p));


    for (const localPrompt of localPrompts) {
      const notionPage = notionPromptsMapById.get(localPrompt.id);
      const localEnabled = localPrompt.enabled === undefined ? true : !!localPrompt.enabled;

      if (notionPage) {
        // Prompt 存在于 Notion 中，检查是否需要更新
        // 确保 notionPage.enabled 被正确解释 (它来自 props.Enabled.checkbox)
        const notionEnabled = notionPage.enabled === undefined ? true : !!notionPage.enabled;

        const contentChanged = localPrompt.content !== notionPage.content;
        const titleChanged = localPrompt.title !== notionPage.title;
        const tagsChanged = JSON.stringify(localPrompt.tags?.sort()) !== JSON.stringify(notionPage.tags?.sort());
        const categoryChanged = (localPrompt.categoryId || DEFAULT_CATEGORY_ID) !== (notionPage.categoryId || DEFAULT_CATEGORY_ID);
        const enabledChanged = localEnabled !== notionEnabled;
        const notesChanged = (localPrompt.notes || '') !== (notionPage.notes || '');
        const lastModifiedChanged = (localPrompt.lastModified || '') !== (notionPage.lastModified || '');

        if (titleChanged || contentChanged || tagsChanged || categoryChanged || enabledChanged || notesChanged || lastModifiedChanged) {
          console.log(`Local prompt "${localPrompt.title}" (ID: ${localPrompt.id}) has changes. Updating Notion page ${notionPage.notionPageId}. Changes: title=${titleChanged}, content=${contentChanged}, tags=${tagsChanged}, category=${categoryChanged}, enabled=${enabledChanged}, notes=${notesChanged}, lastModified=${lastModifiedChanged}`);
          const updateResult = await updateNotionPage(notionPage.notionPageId, localPrompt, apiKey, databaseId, titlePropName);
          if (!updateResult.success && updateResult.error) {
            errors.push(`更新提示词"${localPrompt.title}"失败: ${updateResult.error}`);
          }
        } else {
          console.log(`Local prompt "${localPrompt.title}" (ID: ${localPrompt.id}) matches Notion page ${notionPage.notionPageId}. No update needed.`);
        }
      } else {
        // Prompt 在 Notion 中不存在，创建它
        const pageId = await createNotionPage(localPrompt, apiKey, databaseId, titlePropName);
        if (!pageId) {
          errors.push(`创建提示词"${localPrompt.title}"失败。`);
        }
      }
    }

    // 归档 Notion 中存在但本地 localPrompts 中不存在的提示 (如果它们有 PromptID)
    for (const notionPrompt of notionPrompts) {
      // 在尝试归档之前，还要确保 notionPageId 存在
      if (notionPrompt.id && notionPrompt.notionPageId && !localPromptsMapById.has(notionPrompt.id)) {
        // 这个提示存在于 Notion 但本地不存在。归档它。
        // 这意味着本地删除应导致 Notion 归档。
        console.log(`Prompt "${notionPrompt.title}" (ID: ${notionPrompt.id}, NotionPageID: ${notionPrompt.notionPageId}) exists in Notion but not locally. Archiving.`);
        const archiveResult = await archiveNotionPage(notionPrompt.notionPageId, apiKey);
        if (!archiveResult) {
          errors.push(`归档提示词"${notionPrompt.title}"失败。`);
        }
      }
    }
    
    // 创建/更新后，从存储中重新获取本地提示 (如果 ID 是新生成的或确认的)
    // 这一步可能最好由调用函数 (例如，背景脚本) 处理
    // 如果需要将 Notion Page ID 存储回本地提示。
    // 现在，这个函数专注于推送到 Notion。
    // 但是，让我们确保本地提示在新生成 PromptID 的项目没有 ID 时更新。
    const currentLocalPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    let currentLocalPrompts: PromptItem[] = (currentLocalPromptsResult[BROWSER_STORAGE_KEY as keyof typeof currentLocalPromptsResult] as PromptItem[]) || [];

    currentLocalPrompts = currentLocalPrompts.map(p => {
        if (!p.id) { // 如果 ID 预先生成，则理想情况下不应发生这种情况
            const newId = generatePromptId(p.title, p.content, p.tags);
            console.warn(`Local prompt "${p.title}" was missing an ID. Generated: ${newId}`);
            // 如果在 Notion 中创建了相应的项目，则它使用了这个新 ID。
            // 如果 createNotionPage 不返回 ID 或匹配困难，则此部分会很棘手。
            // 为简单起见，我们假设 ID 存在或由 createNotionPage 正确生成。
            return { ...p, id: newId};
        }
        return p;
    });
    
    // 如果新创建的 Notion 页面需要更新本地提示的 Notion Page ID，这里的逻辑会比较复杂，
    // 因为 createNotionPage 需要返回 Notion Page ID 和 PromptID，然后我们需要将其匹配回来。
    // 当前的 createNotionPage 将 localPrompt.id 作为 PromptID 发送。
    // 因此，目前不需要根据 Notion 的响应直接更新本地存储中的 ID。
    // 最主要的是 PromptID 保持一致。

    console.log('Successfully synced local prompts to Notion.');
    
    // 如果有错误但部分成功，返回部分成功状态
    if (errors.length > 0) {
      return {success: true, errors: errors}; // 尽管有错误，仍将其视为部分成功
    }
    
    return {success: true};
  } catch (error: any) {
    console.error('Error syncing prompts to Notion:', error);
    return {success: false, errors: [error.message || '同步到Notion时发生未知错误']};
  }
}; 