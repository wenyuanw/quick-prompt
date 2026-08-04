import React, { useState, useEffect } from 'react';
import { browser } from '#imports';
import { ExternalLink, FolderOpen, HardDrive, Keyboard, Languages, Loader2, MousePointerClick, PanelRight, Settings2, ShieldCheck, Zap } from "lucide-react";
import {
  getGlobalSettings,
  normalizeHostname,
  updateGlobalSettings,
  type GlobalSettings,
  type QuickInjectDomainRule,
  type QuickInjectMode,
} from '@/utils/globalSettings';
import { getAllPrompts } from "@/utils/promptStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AttachmentStorageMode,
  type AttachmentStorageRootHandle,
  copyFileToAttachmentRoot,
  getAttachmentStorageMode,
  getAttachmentRootHandle,
  getFileFromAttachmentRoot,
  getInternalAttachmentRootHandle,
  hasReadWritePermission,
  pickAndStoreAttachmentRoot,
  saveAttachmentRootHandle,
  saveAttachmentStorageMode,
  verifyReadWritePermission,
} from "@/utils/attachments/fileSystem";
import { SectionCard } from "@/components/common/SectionCard";
import { SettingsRow } from "@/components/common/SettingsRow";
import { PageSurface } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { t, initLocale, setLocale, getCurrentLocale, SUPPORTED_LOCALES } from '@/utils/i18n';
import type { PromptItem } from "@/utils/types";

const hasPromptAttachments = (prompts: PromptItem[]): boolean => (
  prompts.some((prompt) => Array.isArray(prompt.attachments) && prompt.attachments.length > 0)
);

const pickAttachmentRootWithoutSaving = async (): Promise<FileSystemDirectoryHandle> => {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new DOMException("File System Access API is not available", "NotSupportedError");
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });

  if (!(await verifyReadWritePermission(handle))) {
    throw new DOMException("Read/write permission denied", "NotAllowedError");
  }

  return handle;
};

const migrateAttachmentsToRoot = async (
  sourceRoot: AttachmentStorageRootHandle,
  targetRoot: AttachmentStorageRootHandle,
  prompts: PromptItem[]
): Promise<void> => {
  for (const prompt of prompts) {
    for (const attachment of prompt.attachments || []) {
      const file = await getFileFromAttachmentRoot(sourceRoot, attachment.relativePath);
      await copyFileToAttachmentRoot(targetRoot, attachment.relativePath, file);
    }
  }
};

const GlobalSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<GlobalSettings>({
    closeModalOnOutsideClick: true,
    quickInjectEnabled: false,
    quickInjectOnFocus: false,
    quickInjectMode: 'overwrite',
    quickInjectRules: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shortcuts, setShortcuts] = useState<{ [key: string]: string }>({});
  const [storageMode, setStorageMode] = useState<AttachmentStorageMode | undefined>(undefined);
  const [externalDirectoryName, setExternalDirectoryName] = useState<string | undefined>(undefined);
  const [permissionExpired, setPermissionExpired] = useState(false);
  const [isReauthorizing, setIsReauthorizing] = useState(false);
  const [pendingStorageMode, setPendingStorageMode] = useState<AttachmentStorageMode | null>(null);
  const [enabledPrompts, setEnabledPrompts] = useState<PromptItem[]>([]);
  const [newRuleDomain, setNewRuleDomain] = useState('');
  const [newRulePromptId, setNewRulePromptId] = useState('');
  const [ruleError, setRuleError] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const globalSettings = await getGlobalSettings();
        setSettings(globalSettings);
        await initLocale();

        try {
          const prompts = await getAllPrompts();
          setEnabledPrompts(prompts.filter((prompt) => prompt.enabled !== false));
        } catch (error) {
          console.warn('Unable to load prompts for quick inject:', error);
        }

        try {
          const commands = await browser.commands.getAll();
          const shortcutMap: { [key: string]: string } = {};
          commands.forEach(command => {
            if (command.name && command.shortcut) {
              shortcutMap[command.name] = command.shortcut;
            }
          });
          setShortcuts(shortcutMap);
        } catch (error) {
          console.warn('Unable to get shortcuts:', error);
        }

        try {
          const mode = await getAttachmentStorageMode();
          const root = await getAttachmentRootHandle();
          const nextMode = mode || (root ? "external" : undefined);
          setStorageMode(nextMode);
          if (nextMode === "external") {
            setExternalDirectoryName(root?.name);
            if (root && !(await hasReadWritePermission(root))) {
              setPermissionExpired(true);
            }
          }
        } catch (error) {
          console.warn('Unable to load attachment storage info:', error);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSettingChange = async <K extends keyof GlobalSettings>(
    key: K,
    value: GlobalSettings[K]
  ) => {
    try {
      setIsSaving(true);
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      await updateGlobalSettings({ [key]: value });
    } catch (error) {
      console.error('Failed to update setting:', error);
      setSettings(prev => ({ ...prev, [key]: settings[key] }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickInjectRulesChange = async (rules: QuickInjectDomainRule[]) => {
    setRuleError('');
    await handleSettingChange('quickInjectRules', rules);
  };

  const handleAddQuickInjectRule = async () => {
    const domain = normalizeHostname(newRuleDomain);
    if (!domain || !newRulePromptId) {
      setRuleError(t('quickInjectDomainRequired'));
      return;
    }

    if (settings.quickInjectRules.some((rule) => rule.domain === domain)) {
      setRuleError(t('quickInjectDomainExists'));
      return;
    }

    const nextRules = [...settings.quickInjectRules, { domain, promptId: newRulePromptId }];
    await handleQuickInjectRulesChange(nextRules);
    setNewRuleDomain('');
    setNewRulePromptId('');
  };

  const handleRemoveQuickInjectRule = async (domain: string) => {
    const nextRules = settings.quickInjectRules.filter((rule) => rule.domain !== domain);
    await handleQuickInjectRulesChange(nextRules);
  };

  const handleUpdateQuickInjectRulePrompt = async (domain: string, promptId: string) => {
    const nextRules = settings.quickInjectRules.map((rule) =>
      rule.domain === domain ? { ...rule, promptId } : rule
    );
    await handleQuickInjectRulesChange(nextRules);
  };

  const getPromptTitle = (promptId: string) => {
    return enabledPrompts.find((prompt) => prompt.id === promptId)?.title || promptId;
  };

  const handleReauthorizeExternal = async () => {
    if (isReauthorizing) return;
    setIsReauthorizing(true);
    setPendingStorageMode("external");
    try {
      const root = await pickAndStoreAttachmentRoot();
      setPermissionExpired(false);
      setStorageMode("external");
      setExternalDirectoryName(root.name);
    } catch (error) {
      console.error('Failed to reauthorize attachment directory:', error);
    } finally {
      setIsReauthorizing(false);
      setPendingStorageMode(null);
    }
  };

  const handleSwitchToInternal = async () => {
    if (isReauthorizing) return;

    setIsReauthorizing(true);
    setPendingStorageMode("internal");
    try {
      const prompts = await getAllPrompts();
      const sourceRoot = await getAttachmentRootHandle();

      if (storageMode === "external" && hasPromptAttachments(prompts)) {
        if (!sourceRoot || !(await verifyReadWritePermission(sourceRoot))) {
          throw new Error(t('attachmentPermissionLost'));
        }

        await migrateAttachmentsToRoot(sourceRoot, getInternalAttachmentRootHandle(), prompts);
      }

      await saveAttachmentStorageMode("internal");
      setStorageMode("internal");
      setPermissionExpired(false);
    } catch (error) {
      console.error('Failed to switch to internal storage:', error);
      alert(error instanceof Error ? error.message : t('attachmentStorageMigrationFailed'));
    } finally {
      setIsReauthorizing(false);
      setPendingStorageMode(null);
    }
  };

  const handleChooseExternalDirectory = async () => {
    if (isReauthorizing) return;
    setIsReauthorizing(true);
    setPendingStorageMode("external");
    try {
      const prompts = await getAllPrompts();
      const sourceRoot = await getAttachmentRootHandle();
      const root = await pickAttachmentRootWithoutSaving();

      if (storageMode === "internal" && hasPromptAttachments(prompts)) {
        if (!sourceRoot) {
          throw new Error(t('attachmentStorageMigrationFailed'));
        }

        await migrateAttachmentsToRoot(sourceRoot, root, prompts);
      }

      await saveAttachmentRootHandle(root);
      await saveAttachmentStorageMode("external");
      setStorageMode("external");
      setExternalDirectoryName(root.name);
      setPermissionExpired(false);
    } catch (error) {
      console.error('Failed to choose attachment directory:', error);
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        alert(error instanceof Error ? error.message : t('attachmentStorageMigrationFailed'));
      }
    } finally {
      setIsReauthorizing(false);
      setPendingStorageMode(null);
    }
  };

  const openShortcutSettings = () => {
    const isChrome = navigator.userAgent.includes('Chrome');
    const isFirefox = navigator.userAgent.includes('Firefox');

    if (isChrome) {
      browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else if (isFirefox) {
      browser.tabs.create({ url: 'about:addons' });
    } else {
      alert(t('pleaseManuallyNavigateToShortcuts'));
    }
  };

  if (isLoading) {
    return (
      <PageSurface>
        <LoadingState title={t('loading')} description={t('loadingGlobalSettings')} />
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          icon={Settings2}
          title={t('globalSettings')}
          description={t('globalSettingsDescription')}
        />

        <SectionCard contentClassName="divide-y divide-border p-0">
          <SettingsRow
            title={t('languageLabel')}
            description={t('languageDescription')}
            control={
              <div className="flex overflow-hidden rounded-xl border border-border bg-muted p-1">
                {SUPPORTED_LOCALES.map((locale) => {
                  const isActive = (settings.language || getCurrentLocale()) === locale.code;
                  return (
                    <Button
                      key={locale.code}
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "ghost"}
                      disabled={isSaving}
                      onClick={async () => {
                        if (isActive || isSaving) return;
                        await handleSettingChange('language', locale.code);
                        setLocale(locale.code);
                        window.location.reload();
                      }}
                      className="rounded-lg"
                    >
                      <Languages className="size-3.5" />
                      {locale.label}
                    </Button>
                  );
                })}
              </div>
            }
          />

          <SettingsRow
            title={t('closeModalOnOutsideClick')}
            description={t('closeModalOnOutsideClickDescription')}
            control={
              <Switch
                checked={settings.closeModalOnOutsideClick}
                disabled={isSaving}
                onCheckedChange={(checked) => handleSettingChange('closeModalOnOutsideClick', checked)}
                aria-label={t('closeModalOnOutsideClick')}
              />
            }
          />

          <div className="px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">{t('quickInjectSection')}</h3>
            </div>

            <div className="space-y-0 divide-y divide-border rounded-xl border border-border">
              <SettingsRow
                className="px-4"
                title={t('quickInjectEnabled')}
                description={t('quickInjectEnabledDescription')}
                control={
                  <Switch
                    checked={settings.quickInjectEnabled}
                    disabled={isSaving}
                    onCheckedChange={(checked) => handleSettingChange('quickInjectEnabled', checked)}
                    aria-label={t('quickInjectEnabled')}
                  />
                }
              />

              <SettingsRow
                className="px-4"
                title={t('quickInjectOnFocus')}
                description={t('quickInjectOnFocusDescription')}
                control={
                  <Switch
                    checked={settings.quickInjectOnFocus}
                    disabled={isSaving || !settings.quickInjectEnabled}
                    onCheckedChange={(checked) => handleSettingChange('quickInjectOnFocus', checked)}
                    aria-label={t('quickInjectOnFocus')}
                  />
                }
              />

              <SettingsRow
                className="px-4"
                title={t('quickInjectMode')}
                description={t('quickInjectModeDescription')}
                control={
                  <div className="flex overflow-hidden rounded-xl border border-border bg-muted p-1">
                    {([
                      { value: 'overwrite' as QuickInjectMode, label: t('quickInjectModeOverwrite') },
                      { value: 'append' as QuickInjectMode, label: t('quickInjectModeAppend') },
                    ]).map((option) => {
                      const isActive = settings.quickInjectMode === option.value;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={isActive ? "default" : "ghost"}
                          disabled={isSaving || !settings.quickInjectEnabled}
                          onClick={() => {
                            if (!isActive) {
                              void handleSettingChange('quickInjectMode', option.value);
                            }
                          }}
                          className="rounded-lg"
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                }
              />

              <div className="space-y-3 px-4 py-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground">{t('quickInjectRules')}</h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('quickInjectRulesDescription')}
                  </p>
                </div>

                {settings.quickInjectRules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('quickInjectNoRules')}</p>
                ) : (
                  <div className="space-y-2">
                    {settings.quickInjectRules.map((rule) => (
                      <div
                        key={rule.domain}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{rule.domain}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {getPromptTitle(rule.promptId)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={rule.promptId}
                            onValueChange={(value) => {
                              void handleUpdateQuickInjectRulePrompt(rule.domain, value);
                            }}
                            disabled={isSaving || !settings.quickInjectEnabled}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue placeholder={t('quickInjectSelectPrompt')} />
                            </SelectTrigger>
                            <SelectContent>
                              {enabledPrompts.map((prompt) => (
                                <SelectItem key={prompt.id} value={prompt.id}>
                                  {prompt.title}
                                </SelectItem>
                              ))}
                              {!enabledPrompts.some((prompt) => prompt.id === rule.promptId) && (
                                <SelectItem value={rule.promptId}>
                                  {rule.promptId}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => {
                              void handleRemoveQuickInjectRule(rule.domain);
                            }}
                          >
                            {t('quickInjectRemoveRule')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={newRuleDomain}
                    onChange={(event) => {
                      setRuleError('');
                      setNewRuleDomain(event.target.value);
                    }}
                    placeholder={t('quickInjectDomainPlaceholder')}
                    disabled={isSaving || !settings.quickInjectEnabled}
                    className="sm:max-w-56"
                  />
                  <Select
                    value={newRulePromptId || undefined}
                    onValueChange={(value) => {
                      setRuleError('');
                      setNewRulePromptId(value);
                    }}
                    disabled={isSaving || !settings.quickInjectEnabled || enabledPrompts.length === 0}
                  >
                    <SelectTrigger className="sm:w-56">
                      <SelectValue placeholder={t('quickInjectSelectPrompt')} />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledPrompts.map((prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id}>
                          {prompt.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSaving || !settings.quickInjectEnabled}
                    onClick={() => {
                      void handleAddQuickInjectRule();
                    }}
                  >
                    {t('quickInjectAddRule')}
                  </Button>
                </div>

                {ruleError && (
                  <p className="text-xs text-destructive">{ruleError}</p>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">{t('currentAttachmentStorageMode')}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('currentAttachmentStorageModeDescription')}
                </p>
              </div>
              <div className="w-full space-y-2 sm:w-auto sm:min-w-80">
                <div
                  role="radiogroup"
                  aria-label={t('currentAttachmentStorageMode')}
                  className="grid grid-cols-1 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={storageMode === "external"}
                    onClick={handleChooseExternalDirectory}
                    disabled={isReauthorizing || storageMode === "external"}
                    className={cn(
                      "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
                      storageMode === "external"
                        ? "bg-background text-foreground shadow-sm"
                        : "hover:bg-background/70 hover:text-foreground"
                    )}
                  >
                    {pendingStorageMode === "external"
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <FolderOpen className="size-3.5" />}
                    {t('attachmentStorageExternalLabel')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={storageMode === "internal"}
                    onClick={handleSwitchToInternal}
                    disabled={isReauthorizing || storageMode === "internal"}
                    className={cn(
                      "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
                      storageMode === "internal"
                        ? "bg-background text-foreground shadow-sm"
                        : "hover:bg-background/70 hover:text-foreground"
                    )}
                  >
                    {pendingStorageMode === "internal"
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <HardDrive className="size-3.5" />}
                    {t('attachmentStorageInternalLabel')}
                  </button>
                </div>

                {storageMode === "external" && externalDirectoryName && (
                  <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {t('currentAttachmentDirectory', [externalDirectoryName])}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {permissionExpired && (
              <Alert variant="warning" className="mt-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <AlertDescription>{t('attachmentPermissionLost')}</AlertDescription>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReauthorizeExternal}
                    disabled={isReauthorizing}
                    className="shrink-0"
                  >
                    {isReauthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                    {t('reauthorizeAttachmentDirectory')}
                  </Button>
                </div>
              </Alert>
            )}
          </div>

          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Keyboard className="size-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">{t('keyboardShortcuts')}</h3>
              </div>
              <Button onClick={openShortcutSettings} variant="outline" size="sm">
                {t('manageShortcuts')}
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              {[
                { key: 'open-prompt-selector', label: t('openPromptSelector'), icon: MousePointerClick },
                { key: 'save-selected-prompt', label: t('saveSelectedPrompt'), icon: Keyboard },
                { key: 'open-side-panel', label: t('openSidePanel'), icon: PanelRight },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={openShortcutSettings}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="size-4" />
                    {label}
                  </span>
                  {shortcuts[key] ? (
                    <span className="flex items-center gap-1">
                      {shortcuts[key].split('+').map((part, i) => (
                        <React.Fragment key={`${key}-${part}-${i}`}>
                          {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                            {part}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  ) : (
                    <Badge variant="muted">{t('notSet')}</Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        {isSaving && (
          <>
            <Separator />
            <p className={cn("text-center text-xs text-muted-foreground")}>{t('saving')}</p>
          </>
        )}
      </div>
    </PageSurface>
  );
};

export default GlobalSettingsPage; 
