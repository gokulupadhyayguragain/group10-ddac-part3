import { useEffect, useState } from 'react';
import Shell from '../components/Shell';
import { buttonPrimary, panelClass } from '../lib/ui';

type LocalSettings = {
  compactCards: boolean;
  mapFirst: boolean;
  autoRefresh: boolean;
};

const defaultSettings: LocalSettings = {
  compactCards: true,
  mapFirst: true,
  autoRefresh: false,
};

const storageKey = 'safetrace_settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<LocalSettings>(defaultSettings);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setSettings({ ...defaultSettings, ...JSON.parse(stored) });
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  function save() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    setMessage('Local preferences saved.');
  }

  return (
    <Shell title="Settings" subtitle="Local UI preferences and workflow defaults.">
      <section className={`${panelClass} max-w-2xl`}>
        <div className="grid gap-3 text-sm">
          {([
            ['compactCards', 'Compact cards and tables'],
            ['mapFirst', 'Prioritize map sections on screen'],
            ['autoRefresh', 'Auto-refresh lists every minute'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className={buttonPrimary} onClick={save}>Save settings</button>
          {message ? <span className="text-sm text-teal-700">{message}</span> : null}
        </div>
      </section>
    </Shell>
  );
}
