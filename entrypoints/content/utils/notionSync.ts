import type { PromptItem } from '../../options/App';
import { browser, storage } from '#imports';

// 存儲 Notion Database 中真實的標題屬性名稱
let notionDatabaseTitlePropertyName: string = 'Title'; // 默認為 "Title"

// 定義 browser.storage.local 的鍵名，與背景腳本保持一致
const BROWSER_STORAGE_KEY = 'userPrompts';

// 添加獲取數據庫標題屬性名稱的函數
export const getNotionDatabaseTitlePropertyName = async (): Promise<string> => {
  // 由於這個值目前只存在內存中，直接返回變量
  // 如果將來需要持久化，可以考慮存入 storage
  return notionDatabaseTitlePropertyName;
};

// ---- START: ID Generation Functions (copied from background.ts / App.tsx) ----
function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 轉為32位整數
  }
  
  return Math.abs(hash); // 確保是正數
}

function generatePromptId(title: string, content: string, tags?: string[]): string {
  let uniqueString = `${title.trim()}::${content.trim()}`;
  if (tags && tags.length > 0) {
    const sortedTags = [...tags].sort();
    uniqueString += `::${sortedTags.join(',')}`;
  }
  const hash = hashString(uniqueString);
  const hashStr = hash.toString(36);
  return `p${hashStr}`;
}
// ---- END: ID Generation Functions ----

// 獲取已保存的 Notion API 密鑰
export const getNotionApiKey = async (): Promise<string | null> => {
  try {
    const result = await browser.storage.sync.get('notionApiKey');
    return result.notionApiKey || null;
  } catch (error) {
    console.error('Error retrieving Notion API key:', error);
    return null;
  }
};

// 獲取已保存的 Notion 數據庫 ID
export const getDatabaseId = async (): Promise<string | null> => {
  try {
    const result = await browser.storage.sync.get('notionDatabaseId');
    return result.notionDatabaseId || null;
  } catch (error) {
    console.error('Error retrieving Notion database ID:', error);
    return null;
  }
};

// 檢查 Notion 同步是否啟用 (檢查兩個子開關中是否至少有一個開啟)
export const isSyncEnabled = async (): Promise<boolean> => {
  try {
    const result = await browser.storage.sync.get(['notionTimedSyncEnabled', 'notionSyncToNotionEnabled']);
    // 如果兩個子開關中的任一個已開啟，則認為同步功能已啟用
    return !!result.notionTimedSyncEnabled || !!result.notionSyncToNotionEnabled;
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false;
  }
};

// 新增：確保 Notion Database 結構符合要求
async function ensureDatabaseSchema(apiKey: string, databaseId: string): Promise<boolean> {
  try {
    // 1. 獲取當前 Database 的屬性
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!dbResponse.ok) {
      const errorBody = await dbResponse.text();
      console.error(`Failed to fetch database schema for ${databaseId}: ${dbResponse.status}. Body: ${errorBody}`);
      return false;
    }

    const dbData = await dbResponse.json();
    const currentProperties = dbData.properties || {};

    // 2. 定義必需的屬性及其結構 (用於創建)
    // 'Title' 屬性將被特殊處理
    const otherRequiredPropertiesConfig: Record<string, { typeKey: string, config: any }> = {
      'ID': { typeKey: 'rich_text', config: { rich_text: {} } },
      'Content': { typeKey: 'rich_text', config: { rich_text: {} } },
      'Tags': { typeKey: 'multi_select', config: { multi_select: { options: [] } } },
      'Enabled': { typeKey: 'checkbox', config: { checkbox: {} } },
    };

    const propertiesToUpdateOrCreate: Record<string, any> = {};
    let schemaNeedsUpdate = false;

    // --- 特殊處理 "Title" 屬性 ---
    let existingTitlePropNameFromDB: string | null = null; // Database 中實際的 'title' 類型屬性的名稱
    let titlePropertyExistsWithNameTitleAndCorrectType = false;

    for (const propKey in currentProperties) {
      if (currentProperties[propKey].type === 'title') {
        existingTitlePropNameFromDB = propKey;
        if (propKey === 'Title') {
          titlePropertyExistsWithNameTitleAndCorrectType = true;
        }
        break; // 一個數據庫只能有一個 'title' 類型的屬性
      }
    }

    if (existingTitlePropNameFromDB) {
      // 記錄下真實的標題屬性名稱，供後續操作使用
      notionDatabaseTitlePropertyName = existingTitlePropNameFromDB;
      console.log(`Using "${notionDatabaseTitlePropertyName}" as the title property for this Notion database.`);
    }

    if (titlePropertyExistsWithNameTitleAndCorrectType) {
      console.log('Property "Title" of type "title" already exists and is correctly configured in Notion database.');
    } else {
      // "Title" 屬性（名稱為 "Title" 且類型為 "title"）未正確配置
      console.log('Property "Title" (name "Title", type "title") is not correctly configured.');
      if (existingTitlePropNameFromDB) {
        // 數據庫中有一個 'title' 類型的屬性，但其名稱不是 "Title" (例如，名為 "Name")
        console.warn(`The Notion database's main title property is named "${existingTitlePropNameFromDB}", but this extension expects it to be named "Title". Please rename the "${existingTitlePropNameFromDB}" property to "Title" in your Notion database settings. The extension will NOT attempt to create a new property named "Title" of type "title" because a title-type property already exists.`);
      } else {
        // 數據庫中完全沒有任何 'title' 類型的屬性。我們可以嘗試創建一個。
        if (currentProperties['Title']) {
          // 存在一個名為 "Title" 的屬性，但其類型不是 'title'
          console.warn(`A property named "Title" exists in the Notion database, but it is of type "${currentProperties['Title'].type}", not "title". The extension requires the "Title" property to be of type "title". Please change its type in Notion or delete it. The extension will NOT attempt to create or modify it if a property with this name already exists but has the wrong type, to avoid potential data conflicts.`);
        } else {
          // 名為 "Title" 的屬性完全不存在。嘗試創建它。
          console.log('No property of type "title" and no property named "Title" found. Will attempt to create "Title" with type "title".');
          propertiesToUpdateOrCreate['Title'] = { title: {} };
          schemaNeedsUpdate = true;
        }
      }
    }
    // --- "Title" 屬性處理結束 ---

    // 處理其他必要的屬性 (ID, Content, Tags, Enabled)
    for (const propName in otherRequiredPropertiesConfig) {
      const reqConfig = otherRequiredPropertiesConfig[propName];
      if (!currentProperties[propName]) {
        propertiesToUpdateOrCreate[propName] = reqConfig.config;
        schemaNeedsUpdate = true;
        console.log(`Schema Diff: Property "${propName}" is missing from Notion database. Will attempt to create it as type "${reqConfig.typeKey}".`);
      } else {
        // 屬性存在，檢查類型是否匹配
        const existingType = currentProperties[propName].type;
        const requiredType = reqConfig.typeKey;
        if (existingType !== requiredType) {
          console.warn(`Property "${propName}" exists in Notion database but has type "${existingType}", expected "${requiredType}". This might lead to issues if not corrected manually. The extension will proceed but functionality for this field might be impaired.`);
        }
      }
    }

    // 3. 如果 Schema 需要更新，調用 PATCH API
    if (schemaNeedsUpdate && Object.keys(propertiesToUpdateOrCreate).length > 0) {
      console.log('Attempting to update database schema with missing properties:', JSON.stringify(propertiesToUpdateOrCreate));
      const updateResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: propertiesToUpdateOrCreate }),
      });

      if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        let notionErrorMessage = '';
        try {
            const notionError = JSON.parse(errorBody);
            notionErrorMessage = notionError.message || errorBody;
        } catch (e) {
            notionErrorMessage = errorBody;
        }
        console.error(`Failed to update database schema for ${databaseId}: ${updateResponse.status}. Body: ${notionErrorMessage}`);
        return false;
      }
      console.log(`Successfully updated database schema for ${databaseId} with new properties.`);
      // 短暫延遲，給 Notion 一點時間處理 Schema 更新
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('Database schema is already up-to-date with required properties.');
    }
    return true;
  } catch (error) {
    console.error('Error in ensureDatabaseSchema:', error);
    return false;
  }
}

// 與 Notion 數據庫同步提示詞
export async function syncPromptsWithNotion(localPrompts: PromptItem[]): Promise<boolean> {
  const enabled = await isSyncEnabled();
  if (!enabled) {
    console.log('Notion sync is not enabled.');
    return false;
  }

  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();

  if (!apiKey || !databaseId) {
    console.error('Notion API key or Database ID not found for sync.');
    return false;
  }

  console.log('Ensuring Notion database schema...');
  const schemaOk = await ensureDatabaseSchema(apiKey, databaseId);
  if (!schemaOk) {
    console.error('Failed to validate or update Notion database schema. Aborting sync.');
    return false;
  }

  console.log('Starting Notion sync...');

  try {
    const notionPrompts = await fetchPromptsFromNotion();
    if (notionPrompts === null) {
      console.error('Failed to fetch prompts from Notion or no prompts found. Sync aborted.');
      return false;
    }
    console.log(`Fetched ${notionPrompts.length} prompts from Notion.`);

    const localPromptMap = new Map(localPrompts.map(p => [p.id, p]));
    const notionPromptMap = new Map(notionPrompts.map(p => [p.id, p]));

    const promptsToCreateInNotion: PromptItem[] = [];
    const promptsToUpdateInNotion: PromptItem[] = [];

    for (const localPrompt of localPrompts) {
      const notionMatch = notionPromptMap.get(localPrompt.id);
      if (!notionMatch) {
        promptsToCreateInNotion.push(localPrompt);
      } else {
        if (
          localPrompt.title !== notionMatch.title ||
          localPrompt.content !== notionMatch.content ||
          !arraysEqual(localPrompt.tags || [], notionMatch.tags || []) ||
          localPrompt.enabled !== notionMatch.enabled
        ) {
          promptsToUpdateInNotion.push({ ...localPrompt, notionPageId: notionMatch.notionPageId });
        }
      }
    }

    const promptsToCreateLocally = notionPrompts.filter(np => !localPromptMap.has(np.id));
    const promptsToDeleteLocallyIds: string[] = [];
    for (const localPrompt of localPrompts) {
      if (localPrompt.notionPageId) {
        const stillInNotion = notionPrompts.some(np => np.notionPageId === localPrompt.notionPageId);
        if (!stillInNotion) {
          promptsToDeleteLocallyIds.push(localPrompt.id);
        }
      }
    }
    
    const deletedLocallyIds = await storage.getItem<string[]>('local:deletedPromptIds') || [];
    const promptsToArchiveInNotion: Array<{ customId: string, notionPageId: string }> = [];

    for (const deletedId of deletedLocallyIds) {
        const notionPageIdToArchive = await findNotionPageId(deletedId);
        if (notionPageIdToArchive) {
            promptsToArchiveInNotion.push({ customId: deletedId, notionPageId: notionPageIdToArchive });
        }
    }

    let operationsSuccessful = true;

    console.log(`Prompts to create in Notion: ${promptsToCreateInNotion.length}`);
    for (const prompt of promptsToCreateInNotion) {
      if (!await createPromptInNotion(prompt)) {
        operationsSuccessful = false;
      }
    }

    console.log(`Prompts to update in Notion: ${promptsToUpdateInNotion.length}`);
    for (const prompt of promptsToUpdateInNotion) {
      if (!prompt.notionPageId) {
        console.warn(`Skipping update for prompt ID ${prompt.id} because notionPageId is missing.`);
        continue;
      }
      if (!await updatePromptInNotion(prompt)) {
        operationsSuccessful = false;
      }
    }

    if (promptsToCreateLocally.length > 0) {
      console.log(`Prompts to create locally: ${promptsToCreateLocally.length}`);
      try {
        // 直接使用 storage API 創建本地提示詞
        const updatedLocalPrompts = [...localPrompts, ...promptsToCreateLocally];
        await browser.storage.local.set({ [BROWSER_STORAGE_KEY]: updatedLocalPrompts });
        console.log(`Successfully created ${promptsToCreateLocally.length} local prompts from Notion`);
      } catch (storageError) {
        console.error('Error saving prompts to local storage:', storageError);
        operationsSuccessful = false;
      }
    }

    if (promptsToDeleteLocallyIds.length > 0) {
      console.log(`Prompts to delete locally: ${promptsToDeleteLocallyIds.length}`);
      try {
        // 直接使用 storage API 刪除本地提示詞
        const updatedLocalPrompts = localPrompts.filter(p => !promptsToDeleteLocallyIds.includes(p.id));
        await browser.storage.local.set({ [BROWSER_STORAGE_KEY]: updatedLocalPrompts });
        console.log(`Successfully deleted ${promptsToDeleteLocallyIds.length} local prompts`);
      } catch (storageError) {
        console.error('Error deleting prompts from local storage:', storageError);
        operationsSuccessful = false;
      }
    }
    
    if (promptsToArchiveInNotion.length > 0) {
        console.log(`Prompts to archive in Notion: ${promptsToArchiveInNotion.length}`);
        const successfullyArchivedCustomIds: string[] = [];
        for (const item of promptsToArchiveInNotion) {
            const success = await archivePromptInNotion(item.notionPageId);
            if (success) {
                successfullyArchivedCustomIds.push(item.customId);
            } else {
                operationsSuccessful = false;
            }
        }
        if (successfullyArchivedCustomIds.length > 0) {
            const newDeletedLocallyIds = deletedLocallyIds.filter((id: string) => !successfullyArchivedCustomIds.includes(id));
            await browser.storage.local.set({ deletedPromptIds: newDeletedLocallyIds });
            console.log(`Successfully processed ${successfullyArchivedCustomIds.length} deletions from Notion. Updated deletedPromptIds.`);
            if (newDeletedLocallyIds.length < deletedLocallyIds.length && newDeletedLocallyIds.length > 0) {
                console.log(`${newDeletedLocallyIds.length} items remain in deletion queue due to errors.`);
            }
        }
    }

    console.log('Notion sync finished.');
    return operationsSuccessful;

  } catch (error) {
    console.error('Error during Notion sync process:', error);
    return false; 
  }
}

// 從 Notion 獲取提示詞
export async function fetchPromptsFromNotion(): Promise<PromptItem[] | null> {
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();
  const notionDatabaseTitlePropertyName = await getNotionDatabaseTitlePropertyName();

  if (!apiKey || !databaseId) {
    console.warn('Notion API key or Database ID is missing. Cannot fetch prompts.');
    return null;
  }

  const allPrompts: PromptItem[] = [];
  let nextCursor: string | undefined = undefined;

  // Helper function to make paginated queries
  const makeQuery = async (startCursor?: string) => {
    try {
      const queryPayload: any = {
        page_size: 100,
        sorts: [ // Add default sorting by our custom ID property
          {
            property: 'ID', // Assuming 'ID' is the name of your custom ID property in Notion
            direction: 'ascending',
          },
        ],
      };
      if (startCursor) {
        queryPayload.start_cursor = startCursor;
      }

      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryPayload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error querying Notion database:', response.status, errorData);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Network or other error querying Notion:', error);
      return null;
    }
  };

  try {
    do {
      const response = await makeQuery(nextCursor);
      if (!response) return null;

      const { results, next_cursor: newNextCursor } = response;
      nextCursor = newNextCursor;

      for (const page of results) {
        if (page.object === 'page' && page.properties) {
          const props = page.properties;
          const notionPageId = page.id;

          let contentBasedId = props['ID']?.rich_text?.[0]?.plain_text?.trim() || null;
          let needsIdUpdateInNotion = false;

          const title = props[notionDatabaseTitlePropertyName]?.title?.[0]?.plain_text?.trim() || 'Untitled';
          const contentText = props['Content']?.rich_text?.map((rt: any) => rt.plain_text).join('') || ''; // 合併所有 rich_text 部分
          const tags = props['Tags']?.multi_select?.map((tag: any) => tag.name) || [];
          
          if (!contentBasedId) {
            contentBasedId = generatePromptId(title, contentText, tags);
            needsIdUpdateInNotion = true;
            console.log(`Generated new ID ${contentBasedId} for Notion page ${notionPageId} (Title: ${title}) as its "ID" property was missing.`);
          }

          // 如果 Notion 頁面中沒有 "Enabled" 屬性(props['Enabled']?.checkbox === undefined)，則默認為 true。
          // 否則，取其實際值 (true 或 false)。
          const enabled = props['Enabled']?.checkbox === undefined ? true : (props['Enabled']?.checkbox || false);

          allPrompts.push({
            id: contentBasedId!,
            title,
            content: contentText,
            tags,
            enabled: enabled, // 使用上面確定的 enabled 狀態
            notionPageId: notionPageId,
            needsIdUpdateInNotion: needsIdUpdateInNotion,
          });
        }
      }
    } while (nextCursor);

    console.log(`Fetched ${allPrompts.length} prompts from Notion.`);
    return allPrompts;
  } catch (error) {
    console.error('Error fetching prompts from Notion in loop:', error);
    return null;
  }
}

// 新增：輔助函數，用於將新生成的 ID 更新回 Notion
async function updateNotionPageIdProperty(apiKey: string, notionPageId: string, newPromptContentBasedId: string): Promise<boolean> {
  try {
    const propertiesToUpdate: any = {
      'ID': { rich_text: [{ text: { content: newPromptContentBasedId } }] }
    };

    const response = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: propertiesToUpdate }),
    });

    if (!response.ok) {
      let errorBodyText = 'Unknown error';
      try {
        const errorBody = await response.json();
        errorBodyText = errorBody.message || JSON.stringify(errorBody);
      } catch (e) { errorBodyText = await response.text(); }
      console.error(`Failed to update Notion page ${notionPageId} with new ID ${newPromptContentBasedId}: ${response.status}`, errorBodyText);
      return false;
    }
    console.log(`Successfully updated Notion page ${notionPageId} with new content-based ID ${newPromptContentBasedId}.`);
    return true;
  } catch (error) {
    console.error(`Error updating Notion page ${notionPageId} ID property:`, error);
    return false;
  }
}

export async function syncPromptsFromNotion(mode: 'replace' | 'append' = 'replace'): Promise<boolean> {
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();

  if (!apiKey || !databaseId) {
    console.error('Notion sync (from Notion) cannot proceed: API key or Database ID is missing.');
    return false;
  }

  console.log('Ensuring Notion database schema for sync from Notion...');
  const schemaOk = await ensureDatabaseSchema(apiKey, databaseId);
  if (!schemaOk) {
    console.error('Failed to validate or update Notion database schema. Aborting sync from Notion.');
    return false;
  }

  console.log('Starting sync from Notion...');
  try {
    const fetchedNotionPrompts = await fetchPromptsFromNotion();
    if (fetchedNotionPrompts === null) {
      console.error('Failed to fetch prompts from Notion. Sync from Notion aborted.');
      return false;
    }

    if (mode === 'replace') {
      await browser.storage.local.set({ [BROWSER_STORAGE_KEY]: fetchedNotionPrompts });
      console.log(`Successfully replaced local prompts with ${fetchedNotionPrompts.length} prompts from Notion.`);
    } else { // append mode
      const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const currentLocalPrompts: PromptItem[] = localPromptsResult[BROWSER_STORAGE_KEY] || [];
      const localPromptsMap = new Map(currentLocalPrompts.map(p => [p.id, p])); // 建立 id -> prompt 映射
      
      const promptsToAppend = fetchedNotionPrompts.filter(np => !localPromptsMap.has(np.id));
      if (promptsToAppend.length > 0) {
        const newLocalPrompts = [...currentLocalPrompts, ...promptsToAppend];
        await browser.storage.local.set({ [BROWSER_STORAGE_KEY]: newLocalPrompts });
        console.log(`Successfully appended ${promptsToAppend.length} new prompts from Notion to local.`);
      } else {
        console.log('No new prompts from Notion to append to local.');
      }
    }

    // 更新 Notion 中那些新生成了 ID 的頁面
    let allIdUpdatesSuccessful = true;
    for (const prompt of fetchedNotionPrompts) {
      if (prompt.needsIdUpdateInNotion && prompt.notionPageId && prompt.id) {
        const success = await updateNotionPageIdProperty(apiKey, prompt.notionPageId, prompt.id);
        if (!success) {
          allIdUpdatesSuccessful = false;
          console.warn(`Failed to update Notion page ${prompt.notionPageId} with its generated content-based ID ${prompt.id}. This might cause issues in future syncs if not resolved.`);
        }
      }
    }
    
    if (!allIdUpdatesSuccessful) {
        console.warn("Warning: Some Notion pages could not be updated with their generated content-based IDs. The local sync part may have succeeded, but these specific Notion pages might not have their 'ID' property correctly set for future operations.");
        // 即使部分更新回 Notion 失敗，我們仍然認為從 Notion 到本地的同步（用戶主要意圖）可能已成功
        // return false; // 取決於是否因為這個原因將整個同步標記為失敗
    }

    console.log('Sync from Notion completed.');
    return true;
  } catch (error) {
    console.error('Error during sync from Notion:', error);
    return false;
  }
}

// 在 Notion 中創建提示詞
async function createPromptInNotion(prompt: PromptItem): Promise<string | null> {
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();
  if (!apiKey || !databaseId) return null;

  const properties: any = {
    [notionDatabaseTitlePropertyName]: { title: [{ text: { content: prompt.title } }] },
    'ID': { rich_text: [{ text: { content: prompt.id } }] }, // 存儲 content-based ID
    'Content': { rich_text: [{ text: { content: prompt.content } }] },
    'Enabled': { checkbox: prompt.enabled !== undefined ? prompt.enabled : true }
  };
  if (prompt.tags && prompt.tags.length > 0) {
    properties['Tags'] = { multi_select: prompt.tags.map(tag => ({ name: tag })) };
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to create prompt "${prompt.title}" in Notion:`, errorData);
      return null;
    }
    const newPage = await response.json();
    console.log(`Successfully created prompt "${prompt.title}" in Notion with Page ID: ${newPage.id}`);
    return newPage.id; // 返回新創建頁面的 Notion Page ID
  } catch (error) {
    console.error(`Error creating prompt "${prompt.title}" in Notion:`, error);
    return null;
  }
}

// 在 Notion 中更新提示詞
async function updatePromptInNotion(prompt: PromptItem): Promise<boolean> {
  if (!prompt.notionPageId) {
    console.error('Cannot update prompt in Notion without a notionPageId', prompt);
    return false;
  }
  const apiKey = await getNotionApiKey();
  if (!apiKey) return false;

  const properties: any = {
    [notionDatabaseTitlePropertyName]: { title: [{ text: { content: prompt.title } }] },
    'Content': { rich_text: [{ text: { content: prompt.content } }] },
    'Enabled': { checkbox: prompt.enabled !== undefined ? prompt.enabled : true }
  };
  if (prompt.tags) {
    properties['Tags'] = { multi_select: prompt.tags.map(tag => ({ name: tag })) };
  } else {
    properties['Tags'] = { multi_select: [] }; // 如果 tags 為空，則清空 Notion 中的標籤
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${prompt.notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to update prompt "${prompt.title}" (Page ID: ${prompt.notionPageId}) in Notion:`, errorData);
      return false;
    }
    console.log(`Successfully updated prompt "${prompt.title}" (Page ID: ${prompt.notionPageId}) in Notion.`);
    return true;
  } catch (error) {
    console.error(`Error updating prompt "${prompt.title}" (Page ID: ${prompt.notionPageId}) in Notion:`, error);
    return false;
  }
}

// 查找 Notion 頁面 ID
async function findNotionPageId(promptId: string): Promise<string | null> {
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();

  if (!apiKey || !databaseId) {
    console.error('Notion API key or Database ID not found while trying to find page ID.');
    return null;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          property: 'ID',
          rich_text: {
            equals: promptId
          }
        },
        page_size: 1
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Notion API error while finding page ID for promptId "${promptId}": ${response.status}`, errorData.message || errorData);
      return null; 
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    } else {
      console.log(`No Notion page found with custom ID: ${promptId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error in findNotionPageId for promptId "${promptId}":`, error);
    return null;
  }
}

// 工具函數：比較兩個數組是否相等
function arraysEqual(a: any[], b: any[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; ++i) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

// 在 Notion 中歸檔提示詞
async function archivePromptInNotion(notionPageId: string): Promise<boolean> {
  const apiKey = await getNotionApiKey();
  if (!apiKey) {
    console.error('Notion API key not found for archiving.');
    return false;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        archived: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Failed to archive Notion page ${notionPageId}: ${response.status}`, errorData.message || errorData);
      return false;
    }
    console.log(`Successfully archived Notion page: ${notionPageId}`);
    return true;
  } catch (error) {
    console.error(`Error archiving Notion page ${notionPageId}:`, error);
    return false;
  }
}

// 新增：單向同步：本地 -> Notion
export async function syncPromptsToNotion(localPrompts: PromptItem[]): Promise<boolean> {
  // 手動同步不需要檢查開關狀態
  const apiKey = await getNotionApiKey();
  const databaseId = await getDatabaseId();

  if (!apiKey || !databaseId) {
    console.error('Notion API key or Database ID not found for sync (to Notion).');
    return false;
  }

  console.log('Ensuring Notion database schema for sync to Notion...');
  const schemaOk = await ensureDatabaseSchema(apiKey, databaseId);
  if (!schemaOk) {
    console.error('Failed to validate or update Notion database schema. Aborting sync to Notion.');
    return false;
  }

  console.log('Starting sync to Notion...');
  try {
    const notionPrompts = await fetchPromptsFromNotion();
    // if (notionPrompts === null) { // Allow sync to proceed even if Notion fetch fails, to attempt deletions
    //   console.warn('Could not fetch current prompts from Notion. Sync to Notion might be incomplete for creates/updates.');
    // }
    const currentNotionPrompts = notionPrompts || []; // Proceed with empty array if fetch failed
    let allOperationsSuccessful = true;

    // Sync local prompts to Notion (Create or Update)
    // Deletion (archival) is handled separately using local:deletedPromptIds
    for (const lPrompt of localPrompts) {
      if (!lPrompt.id) {
        console.warn('Local prompt missing ID, cannot sync to Notion:', lPrompt.title);
        continue;
      }

      const correspondingNotionPrompt = currentNotionPrompts.find(np => np.id === lPrompt.id);

      if (correspondingNotionPrompt && correspondingNotionPrompt.notionPageId) {
        // Prompt exists in Notion - Check for updates
        const localIsEnabled = lPrompt.enabled !== false; // Treat undefined as true
        const notionIsEnabled = correspondingNotionPrompt.enabled === true;

        const titlesDiffer = lPrompt.title !== correspondingNotionPrompt.title;
        const contentsDiffer = lPrompt.content !== correspondingNotionPrompt.content;
        const tagsDiffer = !arraysEqual(lPrompt.tags || [], correspondingNotionPrompt.tags || []);
        const enabledStateDiffers = localIsEnabled !== notionIsEnabled;

        if (titlesDiffer || contentsDiffer || tagsDiffer || enabledStateDiffers) {
          console.log(`Local prompt "${lPrompt.title}" (ID: ${lPrompt.id}) data or enabled state differs. Attempting update in Notion.`);
          // Pass the local prompt directly, updatePromptInNotion will handle its 'enabled' state.
          const updateSuccess = await updatePromptInNotion({ 
            ...lPrompt, 
            notionPageId: correspondingNotionPrompt.notionPageId 
          });
          if (!updateSuccess) {
            allOperationsSuccessful = false;
            console.error(`Failed to update prompt "${lPrompt.title}" in Notion.`);
          }
        }
      } else {
        // Prompt does not exist in Notion, create it ONLY if it's enabled locally
        if (lPrompt.enabled !== false) { // Also syncs if enabled is undefined (true by default locally before saving)
          console.log(`Local prompt "${lPrompt.title}" (ID: ${lPrompt.id}) not found in Notion. Attempting create.`);
          const createSuccessPageId = await createPromptInNotion(lPrompt);
          if (!createSuccessPageId) {
            allOperationsSuccessful = false;
            console.error(`Failed to create prompt "${lPrompt.title}" in Notion.`);
          }
        } else {
          console.log(`Local prompt "${lPrompt.title}" (ID: ${lPrompt.id}) is disabled and not in Notion. Skipping creation.`);
        }
      }
    }

    // ---- START: Handle DELETED prompts (Archival) ----
    const result = await browser.storage.local.get('deletedPromptIds');
    const deletedLocallyIds = result.deletedPromptIds || [];
    
    if (deletedLocallyIds.length > 0) {
      console.log(`Found ${deletedLocallyIds.length} prompts marked for deletion locally. Attempting to archive in Notion.`);
      const successfullyArchivedCustomIds: string[] = [];

      for (const deletedId of deletedLocallyIds) {
        // Check if this ID still corresponds to an existing prompt in currentNotionPrompts
        // This is a safeguard: if a prompt was deleted locally, then re-added with same ID before sync,
        // we shouldn't archive the re-added one based on the old deletion mark.
        // However, localPrompts (passed to this function) is the source of truth for "current" local state.
        // If an ID is in deletedLocallyIds, it means it's *not* in localPrompts.
        
        const notionPageIdToArchive = await findNotionPageId(deletedId); // Find by our custom content-based ID
        if (notionPageIdToArchive) {
          console.log(`Attempting to archive Notion page ${notionPageIdToArchive} for local deleted ID ${deletedId}`);
          const archiveOpSuccess = await archivePromptInNotion(notionPageIdToArchive);
          if (archiveOpSuccess) {
            successfullyArchivedCustomIds.push(deletedId);
          } else {
            allOperationsSuccessful = false; // Mark overall sync as potentially problematic
            console.error(`Failed to archive Notion page ${notionPageIdToArchive} for prompt ID ${deletedId}.`);
          }
        } else {
          console.log(`Local prompt ID ${deletedId} was marked for deletion, but no corresponding page found in Notion (already deleted or never existed). Removing from deletion queue.`);
          // If not found in Notion, it's effectively "deleted" from Notion's perspective.
          // So, we should still remove it from our local deletion queue.
          successfullyArchivedCustomIds.push(deletedId); 
        }
      }

      if (successfullyArchivedCustomIds.length > 0) {
        const newDeletedLocallyIds = deletedLocallyIds.filter((id: string) => !successfullyArchivedCustomIds.includes(id));
        await browser.storage.local.set({ deletedPromptIds: newDeletedLocallyIds });
        console.log(`Successfully processed ${successfullyArchivedCustomIds.length} deletions from Notion. Updated deletedPromptIds.`);
        if (newDeletedLocallyIds.length < deletedLocallyIds.length && newDeletedLocallyIds.length > 0) {
            console.log(`${newDeletedLocallyIds.length} items remain in deletion queue due to errors.`);
        }
      }
    }
    // ---- END: Handle DELETED prompts (Archival) ----

    console.log('Sync to Notion completed.');
    return allOperationsSuccessful;
  } catch (error) {
    console.error('Error during sync to Notion:', error);
    return false;
  }
}