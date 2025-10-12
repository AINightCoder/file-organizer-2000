import React, { useState, useEffect } from 'react';
import type FileOrganizer from '../../index';

interface CustomizationTabProps {
  plugin: InstanceType<typeof FileOrganizer>;
}

export const CustomizationTab: React.FC<CustomizationTabProps> = ({ plugin }) => {
  const [enableAutoProcessing, setEnableAutoProcessing] = useState(plugin.settings.enableAutoProcessing);
  const [enableFileRenaming, setEnableFileRenaming] = useState(plugin.settings.enableFileRenaming);
  const [renameInstructions, setRenameInstructions] = useState(plugin.settings.renameInstructions);
  const [useSimilarTags, setUseSimilarTags] = useState(plugin.settings.useSimilarTags);
  const [useSimilarTagsInFrontmatter, setUseSimilarTagsInFrontmatter] = useState(plugin.settings.useSimilarTagsInFrontmatter);
  const [useVaultTitles, setUseVaultTitles] = useState(plugin.settings.useVaultTitles);
  const [customFolderInstructions, setCustomFolderInstructions] = useState(plugin.settings.customFolderInstructions);
  const [enableDocumentClassification, setEnableDocumentClassification] = useState(plugin.settings.enableDocumentClassification);
  const [imageInstructions, setImageInstructions] = useState(plugin.settings.imageInstructions);
  const [customTagInstructions, setCustomTagInstructions] = useState(plugin.settings.customTagInstructions);

  // Knowledge base folder routing (new)
  const [eagerCreateLevel3Dirs, setEagerCreateLevel3Dirs] = useState((plugin.settings as any).eagerCreateLevel3Dirs ?? false);
  const [includeExistingLevel3Dirs, setIncludeExistingLevel3Dirs] = useState((plugin.settings as any).includeExistingLevel3Dirs ?? true);
  const [level3Dirs, setLevel3Dirs] = useState<string[]>((plugin.settings as any).level3Dirs ?? ['01.Roadmap','02.What','03.Why','04.How','05.Tool','06.Resource']);
  const [fallbackLevel3Dir, setFallbackLevel3Dir] = useState<string>((plugin.settings as any).fallbackLevel3Dir ?? '02.What');
  const [level3DirHintsText, setLevel3DirHintsText] = useState<string>(() => {
    const hints = ((plugin.settings as any).level3DirHints ?? {}) as Record<string,string>;
    const lines = Object.entries(hints).map(([k,v]) => `${k}: ${v}`);
    return lines.join('\n');
  });

  // force set user embeddings to false
  useEffect(() => {
    plugin.settings.useFolderEmbeddings = false;
    plugin.saveSettings();
  }, [plugin.settings]);

  const handleToggleChange = async (value: boolean, setter: React.Dispatch<React.SetStateAction<boolean>>, settingKey: keyof typeof plugin.settings) => {
    setter(value);
    (plugin.settings[settingKey] as boolean) = value;
    await plugin.saveSettings();
  };

  const handleTextChange = async (value: string, setter: React.Dispatch<React.SetStateAction<string>>, settingKey: keyof typeof plugin.settings) => {
    setter(value);
    (plugin.settings[settingKey] as string) = value;
    await plugin.saveSettings();
  };

  const saveLevel3Dirs = async (dirs: string[]) => {
    const clean = Array.from(new Set(dirs.map(d => (d || '').trim()).filter(Boolean)));
    setLevel3Dirs(clean);
    (plugin.settings as any).level3Dirs = clean;
    // ensure fallback is valid
    if (!clean.includes(fallbackLevel3Dir) && clean.length > 0) {
      setFallbackLevel3Dir(clean[0]);
      (plugin.settings as any).fallbackLevel3Dir = clean[0];
    }
    await plugin.saveSettings();
  };

  const parseHints = (text: string): Record<string,string> => {
    const obj: Record<string,string> = {};
    text.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf(':');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx+1).trim();
      if (key) obj[key] = val;
    });
    return obj;
  };

  return (
    <div className="p-4 space-y-8">
      {/* Inbox Processing Section */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-[--text-normal]">Inbox Processing</h3>
        <div className="bg-[--background-secondary] p-4 rounded-lg mb-4">
          <div className="text-sm text-[--text-muted]">
            These settings control how new files are automatically handled when they enter your vault through the inbox. 
            Enable or disable automatic processing features and configure how the AI should handle your incoming documents.
          </div>
        </div>
        <div className="space-y-4">
          <ToggleSetting
            name="Enable Auto Processing"
            description="Enable automatic processing of files when they are added to the inbox. When disabled, files will only be processed manually."
            value={enableAutoProcessing}
            onChange={(value) => handleToggleChange(value, setEnableAutoProcessing, 'enableAutoProcessing')}
          />
          <ToggleSetting
            name="Inbox Auto-Renaming"
            description="Automatically rename new files when they are processed through the inbox."
            value={enableFileRenaming}
            onChange={(value) => handleToggleChange(value, setEnableFileRenaming, 'enableFileRenaming')}
          />
          <ToggleSetting
            name="Inbox Auto-Formatting"
            description="Automatically format new documents when they match a template category during inbox processing."
            value={enableDocumentClassification}
            onChange={(value) => handleToggleChange(value, setEnableDocumentClassification, 'enableDocumentClassification')}
          />
          <div className="bg-[--background-secondary] p-4 rounded-lg mt-2">
            <div className="font-medium text-[--text-normal] mb-2">Document Type Templates</div>
            <div className="text-sm text-[--text-muted]">
              To enable auto-formatting, create template files in the File Organizer template folder. 
              Name each file according to its document type (e.g., 'workout.md', 'meeting-notes.md'). 
              The content of each file should contain the formatting instructions.
              You can manage these templates through the AI sidebar.
            </div>
          </div>
          <ToggleSetting
            name="Inbox Similar Tags"
            description="Automatically append similar tags to new files during inbox processing."
            value={useSimilarTags}
            onChange={(value) => handleToggleChange(value, setUseSimilarTags, 'useSimilarTags')}
          />
        </div>
      </section>

      {/* General Settings Section */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-[--text-normal]">General Settings</h3>
        <div className="bg-[--background-secondary] p-4 rounded-lg mb-4">
          <div className="text-sm text-[--text-muted]">
            Configure how File Organizer behaves across your vault. These settings affect both manual operations 
            and provide the base configuration for inbox processing. Customize naming conventions, tagging behavior, 
            and folder organization to match your workflow.
          </div>
        </div>
        
        {/* File Naming subsection */}
        <div className="mb-6">
          <h4 className="font-medium text-[--text-normal] mb-2">File Naming</h4>
          <div className="space-y-4">
            <TextAreaSetting
              name="Rename Instructions"
              description="Instructions for how files should be renamed based on their content."
              value={renameInstructions}
              onChange={(value) => handleTextChange(value, setRenameInstructions, 'renameInstructions')}
            />
            <ToggleSetting
              name="Use Vault Context"
              description="Improve AI-generated titles by providing examples from your vault (uses 20 random titles)."
              value={useVaultTitles}
              onChange={(value) => handleToggleChange(value, setUseVaultTitles, 'useVaultTitles')}
            />
          </div>
        </div>

        {/* Tags subsection */}
        <div className="mb-6">
          <h4 className="font-medium text-[--text-normal] mb-2">Tags</h4>
          <div className="space-y-4">
            <ToggleSetting
              name="Use Frontmatter"
              description="Add similar tags in frontmatter instead of inline."
              value={useSimilarTagsInFrontmatter}
              onChange={(value) => handleToggleChange(value, setUseSimilarTagsInFrontmatter, 'useSimilarTagsInFrontmatter')}
            />
            <TextAreaSetting
              name="Tag Generation Instructions"
              description="Custom instructions for generating tags for your notes."
              value={customTagInstructions}
              onChange={(value) => handleTextChange(value, setCustomTagInstructions, 'customTagInstructions')}
            />
          </div>
        </div>

        {/* Folder Section */}
        <div className="mb-6">
          <h4 className="font-medium text-[--text-normal] mb-2">Folder Organization</h4>
          <div className="space-y-4">
            <TextAreaSetting
              name="Custom Folder Determination Instructions"
              description="Provide custom instructions for determining which folders to place your notes in."
              value={customFolderInstructions}
              onChange={(value) => handleTextChange(value, setCustomFolderInstructions, 'customFolderInstructions')}
            />

            <div className="bg-[--background-secondary] p-4 rounded-lg space-y-4">
              <div className="font-medium text-[--text-normal]">Level-3 Directory Strategy</div>
              <ToggleSetting
                name="Eagerly create all level-3 directories"
                description="When a level-2 folder is chosen, immediately create all standard level-3 directories (01.Roadmap, 02.What, ...). If disabled, only create the final chosen level-3 directory (recommended)."
                value={eagerCreateLevel3Dirs}
                onChange={async (value) => {
                  setEagerCreateLevel3Dirs(value);
                  (plugin.settings as any).eagerCreateLevel3Dirs = value;
                  await plugin.saveSettings();
                }}
              />
              <ToggleSetting
                name="Include existing custom level-3 directories"
                description="When doing the second AI selection, include any existing subfolders under the chosen level-2 directory, in addition to the standard set."
                value={includeExistingLevel3Dirs}
                onChange={async (value) => {
                  setIncludeExistingLevel3Dirs(value);
                  (plugin.settings as any).includeExistingLevel3Dirs = value;
                  await plugin.saveSettings();
                }}
              />

              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">Standard Level-3 Directories</div>
                  <div className="setting-item-description">One per line. These will be created under the selected level-2 domain (e.g., 1.Area/SEO/&lt;dir&gt;). The Roadmap folder name is controlled by "Roadmap Folder" and will be substituted for 01.Roadmap.</div>
                </div>
              </div>
              <textarea
                value={level3Dirs.join('\n')}
                onChange={async (e) => {
                  const lines = e.target.value.split(/\r?\n/);
                  await saveLevel3Dirs(lines);
                }}
                className="w-full h-28 p-2 border border-[--background-modifier-border] rounded text-sm font-mono"
                placeholder={"01.Roadmap\n02.What\n03.Why\n04.How\n05.Tool\n06.Resource"}
              />

              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">Fallback Level-3 Directory</div>
                  <div className="setting-item-description">Used when the second AI selection returns no result.</div>
                </div>
                <div className="setting-item-control">
                  <select
                    value={fallbackLevel3Dir}
                    onChange={async (e) => {
                      const val = e.target.value;
                      setFallbackLevel3Dir(val);
                      (plugin.settings as any).fallbackLevel3Dir = val;
                      await plugin.saveSettings();
                    }}
                    className="dropdown"
                  >
                    {level3Dirs.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">Level-3 Directory Hints</div>
                  <div className="setting-item-description">Optional, one "key: value" per line (e.g., "02.What: 核心概念"). These hints help AI choose the right subfolder.</div>
                </div>
              </div>
              <textarea
                value={level3DirHintsText}
                onChange={async (e) => {
                  const text = e.target.value;
                  setLevel3DirHintsText(text);
                  const hints = parseHints(text);
                  (plugin.settings as any).level3DirHints = hints;
                  await plugin.saveSettings();
                }}
                className="w-full h-28 p-2 border border-[--background-modifier-border] rounded text-sm font-mono"
                placeholder={"01.Roadmap: 路径规划, 知识点地图, 索引归档笔记双链\n02.What: 核心概念"}
              />
            </div>
          </div>
        </div>

        {/* Image Processing Section */}
        <div className="mb-6">
          <h4 className="font-medium text-[--text-normal] mb-2">Image Processing</h4>
          <div className="space-y-4">
            <TextAreaSetting
              name="Image Instructions"
              description="Provide instructions for how to process and describe images in your documents."
              value={imageInstructions}
              onChange={(value) => handleTextChange(value, setImageInstructions, 'imageInstructions')}
            />
            <div className="bg-[--background-secondary] p-4 rounded-lg">
              <div className="text-sm text-[--text-muted]">
                These instructions will be used to generate descriptions for images in your documents. 
                The AI will analyze the image content and create descriptions based on your specifications.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

interface ToggleSettingProps {
  name: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({ name, description, value, onChange }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <div className="font-medium text-[--text-normal]">{name}</div>
      <div className="text-sm text-[--text-muted]">{description}</div>
    </div>
    <div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="form-checkbox text-[--interactive-accent]"
      />
    </div>
  </div>
);

interface TextAreaSettingProps {
  name: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TextAreaSetting: React.FC<TextAreaSettingProps> = ({ name, description, value, onChange, disabled }) => (
  <div className="py-2">
    <div className="font-medium text-[--text-normal]">{name}</div>
    <div className="text-sm text-[--text-muted] mb-1">{description}</div>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 text-[--text-normal] bg-[--background-primary] border border-[--background-modifier-border] rounded-lg focus:outline-none focus:border-[--interactive-accent] disabled:bg-[--background-secondary]"
      rows={4}
    />
  </div>
);
