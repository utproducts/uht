'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

interface FAQCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  items: FAQItem[];
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('uht_token');
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  return res.json();
}

export default function FAQAdminPage() {
  const [categories, setCategories] = useState<FAQCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Edit states
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemQ, setEditItemQ] = useState('');
  const [editItemA, setEditItemA] = useState('');

  // Add states
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [addingItemToCat, setAddingItemToCat] = useState<string | null>(null);
  const [newItemQ, setNewItemQ] = useState('');
  const [newItemA, setNewItemA] = useState('');

  const [saving, setSaving] = useState(false);

  const loadFAQs = useCallback(async () => {
    try {
      const data = await apiFetch('/api/faqs');
      if (data.success) setCategories(data.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadFAQs(); }, [loadFAQs]);

  // Category CRUD
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setSaving(true);
    await apiFetch('/api/faqs/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() }),
    });
    setNewCatName('');
    setNewCatDesc('');
    setShowAddCat(false);
    await loadFAQs();
    setSaving(false);
  };

  const handleUpdateCategory = async (id: string) => {
    setSaving(true);
    await apiFetch(`/api/faqs/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: editCatName.trim(), description: editCatDesc.trim() }),
    });
    setEditingCat(null);
    await loadFAQs();
    setSaving(false);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Delete the entire "${name}" category and all its questions?`)) return;
    setSaving(true);
    await apiFetch(`/api/faqs/categories/${id}`, { method: 'DELETE' });
    await loadFAQs();
    setSaving(false);
  };

  // Item CRUD
  const handleAddItem = async (categoryId: string) => {
    if (!newItemQ.trim() || !newItemA.trim()) return;
    setSaving(true);
    await apiFetch(`/api/faqs/categories/${categoryId}/items`, {
      method: 'POST',
      body: JSON.stringify({ question: newItemQ.trim(), answer: newItemA.trim() }),
    });
    setNewItemQ('');
    setNewItemA('');
    setAddingItemToCat(null);
    await loadFAQs();
    setSaving(false);
  };

  const handleUpdateItem = async (id: string) => {
    setSaving(true);
    await apiFetch(`/api/faqs/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ question: editItemQ.trim(), answer: editItemA.trim() }),
    });
    setEditingItem(null);
    await loadFAQs();
    setSaving(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this FAQ question?')) return;
    setSaving(true);
    await apiFetch(`/api/faqs/items/${id}`, { method: 'DELETE' });
    await loadFAQs();
    setSaving(false);
  };

  // Move item up/down within category
  const handleMoveItem = async (categoryId: string, itemId: string, direction: 'up' | 'down') => {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;
    const items = [...cat.items].sort((a, b) => a.sort_order - b.sort_order);
    const idx = items.findIndex(i => i.id === itemId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === items.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [items[idx], items[swapIdx]] = [items[swapIdx], items[idx]];
    setSaving(true);
    await apiFetch('/api/faqs/reorder', {
      method: 'PUT',
      body: JSON.stringify({ type: 'items', ids: items.map(i => i.id) }),
    });
    await loadFAQs();
    setSaving(false);
  };

  // Move category up/down
  const handleMoveCat = async (catId: string, direction: 'up' | 'down') => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(c => c.id === catId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === sorted.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    setSaving(true);
    await apiFetch('/api/faqs/reorder', {
      method: 'PUT',
      body: JSON.stringify({ type: 'categories', ids: sorted.map(c => c.id) }),
    });
    await loadFAQs();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">FAQ Manager</h1>
          <p className="text-sm text-[#86868b] mt-1">
            {categories.length} categories, {categories.reduce((s, c) => s + c.items.length, 0)} questions
          </p>
        </div>
        <button
          onClick={() => setShowAddCat(true)}
          className="px-4 py-2 bg-[#003e79] text-white text-sm font-semibold rounded-lg hover:bg-[#002d5a] transition"
        >
          + Add Category
        </button>
      </div>

      {saving && (
        <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
          Saving...
        </div>
      )}

      {/* Add Category Form */}
      {showAddCat && (
        <div className="mb-6 bg-white border border-[#e8e8ed] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">New Category</h3>
          <input
            type="text"
            placeholder="Category name"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newCatDesc}
            onChange={e => setNewCatDesc(e.target.value)}
            className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
          />
          <div className="flex gap-2">
            <button onClick={handleAddCategory} disabled={!newCatName.trim()} className="px-4 py-2 bg-[#003e79] text-white text-sm font-semibold rounded-lg hover:bg-[#002d5a] disabled:opacity-50 transition">
              Add Category
            </button>
            <button onClick={() => { setShowAddCat(false); setNewCatName(''); setNewCatDesc(''); }} className="px-4 py-2 bg-[#f5f5f7] text-[#6e6e73] text-sm font-semibold rounded-lg hover:bg-[#e8e8ed] transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-4">
        {categories.sort((a, b) => a.sort_order - b.sort_order).map((cat, catIdx) => {
          const isExpanded = expandedCat === cat.id;
          const isEditingCat = editingCat === cat.id;

          return (
            <div key={cat.id} className="bg-white border border-[#e8e8ed] rounded-xl shadow-sm overflow-hidden">
              {/* Category Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => handleMoveCat(cat.id, 'up')} disabled={catIdx === 0} className="text-[#86868b] hover:text-[#003e79] disabled:opacity-30 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                  </button>
                  <button onClick={() => handleMoveCat(cat.id, 'down')} disabled={catIdx === categories.length - 1} className="text-[#86868b] hover:text-[#003e79] disabled:opacity-30 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                </div>

                {/* Category info / edit */}
                <div className="flex-1 min-w-0">
                  {isEditingCat ? (
                    <div className="space-y-2">
                      <input type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30" />
                      <input type="text" value={editCatDesc} onChange={e => setEditCatDesc(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30" />
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateCategory(cat.id)} className="px-3 py-1 bg-[#003e79] text-white text-xs font-semibold rounded-md">Save</button>
                        <button onClick={() => setEditingCat(null)} className="px-3 py-1 bg-[#f5f5f7] text-[#6e6e73] text-xs font-semibold rounded-md">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setExpandedCat(isExpanded ? null : cat.id)} className="text-left w-full">
                      <div className="font-semibold text-[#1d1d1f]">{cat.name}</div>
                      {cat.description && <div className="text-xs text-[#86868b] mt-0.5">{cat.description}</div>}
                    </button>
                  )}
                </div>

                {/* Stats + actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[#86868b] font-medium">{cat.items.length} Q&amp;A</span>
                  {!isEditingCat && (
                    <>
                      <button onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); setEditCatDesc(cat.description || ''); }}
                        className="text-[#86868b] hover:text-[#003e79] transition" title="Edit category">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="text-[#86868b] hover:text-red-600 transition" title="Delete category">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                      <button onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                        className="text-[#86868b] hover:text-[#003e79] transition">
                        <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded items */}
              {isExpanded && (
                <div className="border-t border-[#e8e8ed]">
                  {cat.items.sort((a, b) => a.sort_order - b.sort_order).map((item, itemIdx) => {
                    const isEditingThis = editingItem === item.id;

                    return (
                      <div key={item.id} className="border-b border-[#f5f5f7] last:border-0 px-5 py-3 hover:bg-[#fafafa] transition">
                        {isEditingThis ? (
                          <div className="space-y-2">
                            <input type="text" value={editItemQ} onChange={e => setEditItemQ(e.target.value)}
                              className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#003e79]/30"
                              placeholder="Question" />
                            <textarea value={editItemA} onChange={e => setEditItemA(e.target.value)} rows={4}
                              className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/30 resize-y"
                              placeholder="Answer" />
                            <div className="flex gap-2">
                              <button onClick={() => handleUpdateItem(item.id)} className="px-3 py-1.5 bg-[#003e79] text-white text-xs font-semibold rounded-md hover:bg-[#002d5a] transition">Save</button>
                              <button onClick={() => setEditingItem(null)} className="px-3 py-1.5 bg-[#f5f5f7] text-[#6e6e73] text-xs font-semibold rounded-md hover:bg-[#e8e8ed] transition">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            {/* Reorder */}
                            <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                              <button onClick={() => handleMoveItem(cat.id, item.id, 'up')} disabled={itemIdx === 0} className="text-[#c8c8cc] hover:text-[#003e79] disabled:opacity-30 transition">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                              </button>
                              <button onClick={() => handleMoveItem(cat.id, item.id, 'down')} disabled={itemIdx === cat.items.length - 1} className="text-[#c8c8cc] hover:text-[#003e79] disabled:opacity-30 transition">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                              </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[#1d1d1f]">{item.question}</div>
                              <div className="text-xs text-[#6e6e73] mt-1 line-clamp-2">{item.answer}</div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => { setEditingItem(item.id); setEditItemQ(item.question); setEditItemA(item.answer); }}
                                className="text-[#c8c8cc] hover:text-[#003e79] transition" title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)}
                                className="text-[#c8c8cc] hover:text-red-600 transition" title="Delete">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add item form */}
                  {addingItemToCat === cat.id ? (
                    <div className="px-5 py-4 bg-[#f9f9fb]">
                      <input type="text" value={newItemQ} onChange={e => setNewItemQ(e.target.value)}
                        placeholder="Question"
                        className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm font-medium mb-2 focus:outline-none focus:ring-2 focus:ring-[#003e79]/30" />
                      <textarea value={newItemA} onChange={e => setNewItemA(e.target.value)} rows={3}
                        placeholder="Answer"
                        className="w-full px-3 py-2 border border-[#d2d2d7] rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#003e79]/30 resize-y" />
                      <div className="flex gap-2">
                        <button onClick={() => handleAddItem(cat.id)} disabled={!newItemQ.trim() || !newItemA.trim()}
                          className="px-4 py-1.5 bg-[#003e79] text-white text-xs font-semibold rounded-md hover:bg-[#002d5a] disabled:opacity-50 transition">
                          Add Question
                        </button>
                        <button onClick={() => { setAddingItemToCat(null); setNewItemQ(''); setNewItemA(''); }}
                          className="px-4 py-1.5 bg-[#f5f5f7] text-[#6e6e73] text-xs font-semibold rounded-md hover:bg-[#e8e8ed] transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingItemToCat(cat.id); setNewItemQ(''); setNewItemA(''); }}
                      className="w-full px-5 py-3 text-left text-sm text-[#003e79] font-medium hover:bg-[#f0f7ff] transition flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Add Question
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[#86868b] text-lg">No FAQ categories yet</p>
          <p className="text-[#86868b] text-sm mt-1">Click "Add Category" to get started</p>
        </div>
      )}
    </div>
  );
}
