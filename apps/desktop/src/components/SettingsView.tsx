import { Button } from "@moyu/ui";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { openAccessibilitySettings, platformCapabilities } from "../services/bridge";
import { useAppStore } from "../store/useAppStore";

export function SettingsView() {
  const preferences = useAppStore((state) => state.preferences);
  const capabilities = useAppStore((state) => state.capabilities);
  const updatePreferences = useAppStore((state) => state.updatePreferences);
  const modelStatuses = useAppStore((state) => state.modelStatuses);
  const installLanguageModel = useAppStore((state) => state.installLanguageModel);
  const removeLanguageModel = useAppStore((state) => state.removeLanguageModel);
  const close = useAppStore((state) => state.setSettingsOpen);
  const setCapabilities = useAppStore((state) => state.setCapabilities);
  const hotkeyStatus = capabilities?.hotkeyStatus ?? "starting";

  const updateDictionary = (patch: Partial<typeof preferences.dictionaryOptions>) =>
    updatePreferences({ dictionaryOptions: { ...preferences.dictionaryOptions, ...patch } });

  return (
    <div className="settings-view">
      <header className="settings-view__header">
        <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => close(false)}>返回翻译</Button>
        <h2>设置</h2>
      </header>

      <div className="settings-section">
        <h3>触发与窗口</h3>
        <Toggle label={`启用 ${capabilities?.triggerKeyLabel ?? "Option"} 长按呼出`} checked={preferences.enabled} onChange={(enabled) => updatePreferences({ enabled })} />
        <Toggle label="登录时启动" checked={preferences.launchAtLogin} onChange={(launchAtLogin) => updatePreferences({ launchAtLogin })} />
        <label className="settings-range">
          <span>长按时间</span>
          <output>{preferences.holdDurationMilliseconds}ms</output>
          <input type="range" min="250" max="700" step="50" value={preferences.holdDurationMilliseconds} onChange={(event) => updatePreferences({ holdDurationMilliseconds: Number(event.target.value) })} />
        </label>
      </div>

      <div className="settings-section">
        <h3>词典结果</h3>
        <Toggle label="Moyu 离线词典" checked={preferences.dictionaryOptions.useOfflineDictionary} onChange={(useOfflineDictionary) => updateDictionary({ useOfflineDictionary })} />
        <Toggle label="平台系统词典" checked={preferences.dictionaryOptions.usePlatformDictionary} onChange={(usePlatformDictionary) => updateDictionary({ usePlatformDictionary })} disabled={!capabilities?.platformDictionary} />
        <Toggle label="考试词汇标签" checked={preferences.dictionaryOptions.showVocabularyTags} onChange={(showVocabularyTags) => updateDictionary({ showVocabularyTags })} />
        <Toggle label="例句" checked={preferences.dictionaryOptions.includeExamples} onChange={(includeExamples) => updateDictionary({ includeExamples })} />
        <Toggle label="同反义词" checked={preferences.dictionaryOptions.includeRelations} onChange={(includeRelations) => updateDictionary({ includeRelations })} />
      </div>

      <div className="settings-section">
        <h3>发音</h3>
        <Toggle
          label="查询后自动发音"
          checked={preferences.autoPronounce}
          onChange={(autoPronounce) => updatePreferences({ autoPronounce })}
          disabled={capabilities?.textToSpeech === false}
        />
        <p className="settings-note">英文单词或短语查询成功后默认美音自动朗读；结果页可手动选择 UK / US 发音。</p>
      </div>

      <div className="settings-section">
        <h3>离线句子翻译</h3>
        <ModelRow
          label="英文 → 中文 q8"
          status={modelStatuses.find((item) => item.id === "moyu-en-zh-q8-v1")}
          onInstall={() => installLanguageModel("en-zh")}
          onRemove={() => removeLanguageModel("en-zh")}
        />
        <ModelRow
          label="中文 → 英文 q8"
          status={modelStatuses.find((item) => item.id === "moyu-zh-en-q8-v1")}
          onInstall={() => installLanguageModel("zh-en")}
          onRemove={() => removeLanguageModel("zh-en")}
        />
        <p className="settings-note">首次下载需要联网。模型缓存完成后，单词和句子翻译均可断网运行。</p>
      </div>

      <div className="settings-section">
        <h3>隐私</h3>
        <Toggle label="保存本地查询历史" checked={preferences.historyEnabled} onChange={(historyEnabled) => updatePreferences({ historyEnabled })} />
        <p className="settings-note">历史默认关闭。收藏和开启后的历史仅存储在当前电脑，不会上传。</p>
      </div>

      <div className="settings-section permission-grid">
        <h3>系统能力</h3>
        <div className="status-row"><span>{capabilities?.triggerKeyLabel ?? "Option"} 长按监听</span><strong data-state={hotkeyStatus}>{hotkeyStatusText(hotkeyStatus)}</strong></div>
        {capabilities?.platform === "macos" && hotkeyStatus === "permission-required" && (
          <div className="permission-help">
            <p>需要辅助功能权限才能监听 Option 长按。授权后 Moyu 会自动恢复，无需重启。</p>
            <div className="permission-actions">
              <button type="button" onClick={() => void openAccessibilitySettings()}><ExternalLink size={13} />打开系统设置</button>
              <button type="button" onClick={async () => setCapabilities(await platformCapabilities())}><RefreshCw size={13} />重新检查权限</button>
            </div>
          </div>
        )}
        <Status label="辅助功能 / UI Automation" value={capabilities?.accessibility ?? "not-determined"} />
        <Status label="屏幕捕获" value={capabilities?.screenCapture ?? "not-determined"} />
        <Status label="本地朗读" value={capabilities?.textToSpeech ? "granted" : "unavailable"} />
      </div>
    </div>
  );
}

function hotkeyStatusText(value: string) {
  switch (value) {
    case "ready": return "监听中";
    case "permission-required": return "需要授权";
    case "retrying": return "正在恢复";
    case "disabled": return "已停用";
    default: return "启动中";
  }
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  const text = value === "granted" ? "可用" : value === "denied" ? "未授权" : value === "unavailable" ? "不可用" : "待检查";
  return <div className="status-row"><span>{label}</span><strong data-state={value}>{text}</strong></div>;
}

function ModelRow({ label, status, onInstall, onRemove }: {
  label: string;
  status?: import("@moyu/contracts").ModelPackStatus;
  onInstall: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const state = status?.state ?? "missing";
  const progress = status?.totalBytes
    ? Math.min(100, Math.round(status.downloadedBytes / status.totalBytes * 100))
    : null;
  const text = state === "ready"
    ? "已就绪"
    : state === "downloading"
      ? progress === null ? "准备中" : `${progress}%`
      : state === "error" || state === "invalid"
        ? "重试"
        : "下载";
  return (
    <div className="model-row">
      <div><span>{label}<small data-state={state}>{text}</small></span>{state === "downloading" && <progress max="100" value={progress ?? undefined} />}</div>
      <button type="button" className={state === "ready" ? "is-icon" : ""} disabled={state === "downloading"} title={state === "ready" ? "删除语言包" : text} aria-label={state === "ready" ? `删除${label}语言包` : `${text}${label}语言包`} onClick={() => void (state === "ready" ? onRemove() : onInstall())}>
        {state === "ready" ? <Trash2 size={13} /> : text}
      </button>
    </div>
  );
}
