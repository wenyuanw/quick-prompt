import React, { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import {
  getGlobalSettings,
  normalizeHostname,
  updateGlobalSettings,
  type GlobalSettings,
  type QuickInjectDomainRule,
  type QuickInjectMode,
} from "@/utils/globalSettings";
import { getAllPrompts } from "@/utils/promptStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/common/SectionCard";
import { SettingsRow } from "@/components/common/SettingsRow";
import { PageSurface } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { t, initLocale } from "@/utils/i18n";
import type { PromptItem } from "@/utils/types";
import ConfirmModal from "./ConfirmModal";

const QuickInjectSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<GlobalSettings>({
    closeModalOnOutsideClick: true,
    quickInjectEnabled: false,
    quickInjectOnFocus: false,
    quickInjectMode: "overwrite",
    quickInjectRules: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [enabledPrompts, setEnabledPrompts] = useState<PromptItem[]>([]);
  const [newRuleDomain, setNewRuleDomain] = useState("");
  const [newRulePromptId, setNewRulePromptId] = useState("");
  const [ruleError, setRuleError] = useState("");
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        await initLocale();
        const globalSettings = await getGlobalSettings();
        setSettings(globalSettings);

        try {
          const prompts = await getAllPrompts();
          setEnabledPrompts(prompts.filter((prompt) => prompt.enabled !== false));
        } catch (error) {
          console.warn("Unable to load prompts for quick inject:", error);
        }
      } catch (error) {
        console.error("Failed to load quick inject settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSettings();
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
      console.error("Failed to update setting:", error);
      setSettings((prev) => ({ ...prev, [key]: settings[key] }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickInjectRulesChange = async (rules: QuickInjectDomainRule[]) => {
    setRuleError("");
    await handleSettingChange("quickInjectRules", rules);
  };

  const handleAddQuickInjectRule = async () => {
    const domain = normalizeHostname(newRuleDomain);
    if (!domain || !newRulePromptId) {
      setRuleError(t("quickInjectDomainRequired"));
      return;
    }

    if (settings.quickInjectRules.some((rule) => rule.domain === domain)) {
      setRuleError(t("quickInjectDomainExists"));
      return;
    }

    const nextRules = [...settings.quickInjectRules, { domain, promptId: newRulePromptId }];
    await handleQuickInjectRulesChange(nextRules);
    setNewRuleDomain("");
    setNewRulePromptId("");
  };

  const handleRemoveQuickInjectRule = async (domain: string) => {
    const nextRules = settings.quickInjectRules.filter((rule) => rule.domain !== domain);
    await handleQuickInjectRulesChange(nextRules);
  };

  const handleConfirmDeleteRule = async () => {
    if (!ruleToDelete) {
      return;
    }

    const domain = ruleToDelete;
    setRuleToDelete(null);
    await handleRemoveQuickInjectRule(domain);
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

  if (isLoading) {
    return (
      <PageSurface>
        <LoadingState title={t("loading")} description={t("loadingQuickInjectSettings")} />
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          icon={Zap}
          title={t("quickInjectSection")}
          description={t("quickInjectPageDescription")}
        />

        <SectionCard contentClassName="divide-y divide-border p-0">
          <SettingsRow
            title={t("quickInjectEnabled")}
            description={t("quickInjectEnabledDescription")}
            control={
              <Switch
                checked={settings.quickInjectEnabled}
                disabled={isSaving}
                onCheckedChange={(checked) => handleSettingChange("quickInjectEnabled", checked)}
                aria-label={t("quickInjectEnabled")}
              />
            }
          />

          <SettingsRow
            title={t("quickInjectOnFocus")}
            description={t("quickInjectOnFocusDescription")}
            control={
              <Switch
                checked={settings.quickInjectOnFocus}
                disabled={isSaving || !settings.quickInjectEnabled}
                onCheckedChange={(checked) => handleSettingChange("quickInjectOnFocus", checked)}
                aria-label={t("quickInjectOnFocus")}
              />
            }
          />

          <SettingsRow
            title={t("quickInjectMode")}
            description={t("quickInjectModeDescription")}
            control={
              <div className="flex overflow-hidden rounded-xl border border-border bg-muted p-1">
                {([
                  { value: "overwrite" as QuickInjectMode, label: t("quickInjectModeOverwrite") },
                  { value: "append" as QuickInjectMode, label: t("quickInjectModeAppend") },
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
                          void handleSettingChange("quickInjectMode", option.value);
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

          <div className="space-y-3 px-5 py-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("quickInjectRules")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("quickInjectRulesDescription")}
              </p>
            </div>

            {settings.quickInjectRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("quickInjectNoRules")}</p>
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
                          <SelectValue placeholder={t("quickInjectSelectPrompt")} />
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
                        variant="destructive"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => {
                          setRuleToDelete(rule.domain);
                        }}
                      >
                        {t("quickInjectRemoveRule")}
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
                  setRuleError("");
                  setNewRuleDomain(event.target.value);
                }}
                placeholder={t("quickInjectDomainPlaceholder")}
                disabled={isSaving || !settings.quickInjectEnabled}
                className="sm:max-w-56"
              />
              <Select
                value={newRulePromptId || undefined}
                onValueChange={(value) => {
                  setRuleError("");
                  setNewRulePromptId(value);
                }}
                disabled={isSaving || !settings.quickInjectEnabled || enabledPrompts.length === 0}
              >
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder={t("quickInjectSelectPrompt")} />
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
                {t("quickInjectAddRule")}
              </Button>
            </div>

            {ruleError && (
              <p className="text-xs text-destructive">{ruleError}</p>
            )}
          </div>
        </SectionCard>

        {isSaving && (
          <>
            <Separator />
            <p className={cn("text-center text-xs text-muted-foreground")}>{t("saving")}</p>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={ruleToDelete !== null}
        onClose={() => setRuleToDelete(null)}
        onConfirm={() => {
          void handleConfirmDeleteRule();
        }}
        title={t("confirmDeleteQuickInjectRule")}
        message={t("confirmDeleteQuickInjectRuleMessage", [ruleToDelete || ""])}
        confirmText={t("delete")}
        cancelText={t("cancel")}
      />
    </PageSurface>
  );
};

export default QuickInjectSettingsPage;
