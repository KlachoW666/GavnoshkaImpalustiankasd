import { useState, useEffect, useCallback } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  author_id: string | null;
  published: number;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  media_urls?: string | null;
}

const cardStyle = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};
const miniCardStyle = { background: 'var(--bg-hover)' };

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return s;
  }
}

export default function AdminNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formMediaUrls, setFormMediaUrls] = useState('');
  const [formPublished, setFormPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  function parseMediaUrlsRaw(raw: string | null | undefined): string[] {
    if (raw == null || raw === '') return [];
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  function mediaUrlsToText(raw: string | null | undefined): string {
    const arr = parseMediaUrlsRaw(raw);
    return arr.join('\n');
  }

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.get<{ news: NewsItem[] }>('/admin/news');
      setNews(data.news || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const openCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormImageUrl('');
    setFormMediaUrls('');
    setFormPublished(true);
    setModalOpen(true);
  };

  const openEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormImageUrl(item.image_url ?? '');
    setFormMediaUrls(mediaUrlsToText(item.media_urls));
    setFormPublished(item.published === 1);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const title = formTitle.trim();
    if (!title) {
      setError('Заголовок обязателен');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const mediaUrlsArray = formMediaUrls.split(/\n/).map((s) => s.trim()).filter(Boolean);
      const imageUrl = formImageUrl.trim() || null;
      if (editingId != null) {
        await adminApi.put(`/admin/news/${editingId}`, {
          title,
          content: formContent,
          image_url: imageUrl,
          media_urls: mediaUrlsArray,
          published: formPublished
        });
      } else {
        await adminApi.post('/admin/news', {
          title,
          content: formContent,
          image_url: imageUrl,
          media_urls: mediaUrlsArray,
          published: formPublished
        });
      }
      setModalOpen(false);
      await fetchNews();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить эту новость?')) return;
    setError('');
    try {
      await adminApi.del(`/admin/news/${id}`);
      await fetchNews();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📰</span>
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Новости</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Новости на главной странице. Добавление, редактирование и удаление.</p>
          </div>
        </div>
        <Button variant="primary" onClick={openCreate}>Добавить новость</Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Список новостей</h3>
        {news.length === 0 ? (
          <div className="py-10 text-center rounded-lg text-sm" style={miniCardStyle}>
            <span className="text-4xl opacity-50">📰</span>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Нет новостей. Нажмите «Добавить новость».</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {news.map((item) => (
              <li
                key={item.id}
                className="rounded-lg px-4 py-3 flex flex-wrap items-start justify-between gap-3"
                style={miniCardStyle}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  {item.content && (
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{item.content}</p>
                  )}
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(item.updated_at)}
                    {item.published === 1 ? (
                      <span className="ml-2 px-2 py-0.5 rounded-full" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>Опубликовано</span>
                    ) : (
                      <span className="ml-2 px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-card-solid)', color: 'var(--text-muted)' }}>Черновик</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>Изменить</Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId != null ? 'Редактировать новость' : 'Добавить новость'}
        maxWidth="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !formTitle.trim()}>
              {saving ? 'Сохранение…' : (editingId != null ? 'Сохранить' : 'Добавить')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Заголовок *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Заголовок новости"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Текст</label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Текст новости"
              rows={4}
              className="w-full rounded-lg px-3 py-2 text-sm resize-y"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Картинка (URL)</label>
            <input
              type="url"
              value={formImageUrl}
              onChange={(e) => setFormImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Медиа (URL — по одному на строку)</label>
            <textarea
              value={formMediaUrls}
              onChange={(e) => setFormMediaUrls(e.target.value)}
              placeholder={'https://youtube.com/...\nhttps://example.com/video.mp4'}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm resize-y font-mono text-xs"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Ссылки на видео (YouTube, mp4) или файлы. По одной на строку.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formPublished}
              onChange={(e) => setFormPublished(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Опубликовать (показывать на главной)</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
