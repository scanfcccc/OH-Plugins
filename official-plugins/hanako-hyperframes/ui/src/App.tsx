import { useEffect, useMemo, useState } from 'react';
import { hana } from '@hana/plugin-sdk';
import { Button, HanaThemeProvider, TextInput } from '@hana/plugin-components';
import { api, Preview, Project } from './api';
import { createTranslator, detectLocale, htmlLangForLocale } from './i18n';

type BusyState = 'create' | 'preview' | 'refresh' | null;

export function App() {
  const locale = useMemo(() => detectLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState(() => t('defaultProjectTitle'));
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) || projects[0] || null,
    [projects, selectedId],
  );
  const previewForSelected = preview?.projectId === selected?.id ? preview : null;
  const studioUrl = previewForSelected?.rawUrl || previewForSelected?.url || '';

  useEffect(() => {
    document.documentElement.lang = htmlLangForLocale(locale);
    document.title = t('documentTitle');
    let alive = true;
    loadStateWithRetry()
      .then((state) => {
        if (!alive || !state.selectedId) return;
        startStudio(state.selectedId, { silent: true });
      })
      .catch((err) => {
        if (alive) setError(messageOf(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function loadState() {
    setError(null);
    const projectResult = await api.listProjects();
    const nextSelectedId = resolveSelectedId(projectResult.projects, selectedId);
    setProjects(projectResult.projects);
    setSelectedId(nextSelectedId);
    return { projects: projectResult.projects, selectedId: nextSelectedId };
  }

  async function loadStateWithRetry() {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const state = await loadState();
        if (state.projects.length > 0 || attempt === 4) return state;
      } catch (err) {
        lastError = err;
        if (attempt === 4) throw err;
      }
      await delay(220 + attempt * 180);
    }
    throw lastError || new Error('Unable to load HyperFrames projects');
  }

  async function refresh() {
    setBusy('refresh');
    try {
      const state = await loadState();
      if (state.selectedId) {
        await startStudio(state.selectedId, { silent: true });
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function createProject() {
    setBusy('create');
    setError(null);
    try {
      const result = await api.createProject(title);
      setProjects((items) => [result.project, ...items]);
      setSelectedId(result.project.id);
      setPreview(null);
      await startStudio(result.project.id);
      await hana.toast.show({ message: t('toastProjectCreated'), type: 'success' });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function startStudio(projectId = selected?.id || '', options: { silent?: boolean } = {}) {
    if (!projectId) return;
    setBusy('preview');
    if (!options.silent) setError(null);
    try {
      const result = await api.startPreview(projectId);
      setPreview(result.preview);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy((current) => (current === 'preview' ? null : current));
    }
  }

  return (
    <HanaThemeProvider mode="inherit">
      <main className="hf-shell">
        {studioUrl ? (
          <section className="hf-frame-wrap" aria-label={t('studioFrameTitle')}>
            <iframe
              className="hf-studio-frame"
              title={t('studioFrameTitle')}
              src={studioUrl}
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </section>
        ) : (
          <section className="hf-empty">
            <div className="hf-empty-panel">
              <span className="hf-kicker">HyperFrames</span>
              <h1>{projects.length ? t('startingStudio') : t('emptyTitle')}</h1>
              <p>{error || (projects.length ? t('startingStudioDetail') : t('emptyDescription'))}</p>
              {!projects.length ? (
                <div className="hf-create-inline">
                  <TextInput
                    label={t('projectLabel')}
                    value={title}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                  />
                  <Button variant="primary" onClick={createProject} loading={busy === 'create'}>
                    {t('create')}
                  </Button>
                </div>
              ) : (
                <div className="hf-actions">
                  <Button variant="secondary" onClick={refresh} loading={busy === 'refresh' || busy === 'preview'}>
                    {t('refresh')}
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </HanaThemeProvider>
  );
}

function resolveSelectedId(projects: Project[], currentId: string) {
  if (currentId && projects.some((project) => project.id === currentId)) return currentId;
  return projects[0]?.id || '';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
