'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';

const API = 'https://uht.chad-157.workers.dev';

/* ─── Types ─── */

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  image_urls: string | null;
  event_id: string | null;
  active: number;
  sort_order: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_cents: number;
  size: string | null;
  image_url: string | null;
}

interface Order {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  status: string;
  subtotal: number;
  shipping: number;
  total: number;
  shipping_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  created_at: string;
  items: OrderItem[];
}

interface EventOption {
  id: string;
  name: string;
}

/* ─── Constants ─── */

const CATEGORIES = ['Beanies', 'Hats', 'Blankets', 'Pins'];

const CATEGORY_COLORS: Record<string, string> = {
  beanies: 'bg-purple-50 text-purple-700 border-purple-200',
  hats: 'bg-blue-50 text-blue-700 border-blue-200',
  blankets: 'bg-amber-50 text-amber-700 border-amber-200',
  pins: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

/* ─── Helpers ─── */

const devHeaders: Record<string, string> = { 'X-Dev-Bypass': 'true' };

function adminHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = { ...devHeaders };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function fmtPrice(dollars: number): string {
  return '$' + Number(dollars).toFixed(2);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Component ─── */

export default function AdminShopPage() {
  const [tab, setTab] = useState<'products' | 'orders'>('products');

  /* Products state */
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  /* Orders state */
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  /* Events for dropdown */
  const [events, setEvents] = useState<EventOption[]>([]);

  /* Modal state */
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  /* Product form */
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('Beanies');
  const [formEventId, setFormEventId] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formImageUrls, setFormImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  /* Image lightbox */
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  /* Delete confirmation */
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Order expand */
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  /* ─── Fetch Products ─── */
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch(`${API}/api/shop/products`, { headers: adminHeaders() });
      const json = await res.json();
      if (json.success) setProducts(json.data || json.products || []);
      else if (Array.isArray(json.data)) setProducts(json.data);
      else if (Array.isArray(json)) setProducts(json);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  /* ─── Fetch Orders ─── */
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`${API}/api/shop/orders`, { headers: adminHeaders() });
      const json = await res.json();
      if (json.success) setOrders(json.data || json.orders || []);
      else if (Array.isArray(json.data)) setOrders(json.data);
      else if (Array.isArray(json)) setOrders(json);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  /* ─── Fetch Events ─── */
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/events?season=2026-27`, { headers: adminHeaders() });
      const json = await res.json();
      const list = json.data || json.events || [];
      setEvents(list.map((e: any) => ({ id: e.id, name: e.name })).sort((a: EventOption, b: EventOption) => a.name.localeCompare(b.name)));
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchEvents();
  }, [fetchProducts, fetchOrders, fetchEvents]);

  /* ─── Open Modal ─── */
  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormCategory('Beanies');
    setFormEventId('');
    setFormActive(true);
    setFormSortOrder('0');
    setFormImageUrls([]);
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormDescription(p.description || '');
    setFormPrice(Number(p.price).toFixed(2));
    setFormCategory(p.category.charAt(0).toUpperCase() + p.category.slice(1).toLowerCase());
    setFormEventId(p.event_id || '');
    setFormActive(!!p.active);
    setFormSortOrder(String(p.sort_order || 0));
    // Load existing images
    const existingImages: string[] = [];
    if (p.image_url) existingImages.push(p.image_url);
    if (p.image_urls) {
      try { existingImages.push(...JSON.parse(p.image_urls)); } catch {}
    }
    setFormImageUrls(Array.from(new Set(existingImages)));
    setShowModal(true);
  };

  /* ─── Image Upload (supports multiple) ─── */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        const res = await fetch(`${API}/api/upload/image`, {
          method: 'POST',
          headers: { ...devHeaders },
          body: formData,
        });
        const json = await res.json();
        const url = json.url || json.data?.url;
        if (url) {
          setFormImageUrls(prev => [...prev, url]);
        }
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setUploading(false);
      // Reset file input so re-selecting same file works
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setFormImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  /* ─── Save Product ─── */
  const handleSaveProduct = async () => {
    if (!formName.trim() || !formPrice.trim()) return;
    setSaving(true);
    try {
      const priceDollars = parseFloat(formPrice);
      const body = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        price: priceDollars,
        category: formCategory.toLowerCase(),
        image_url: formImageUrls[0] || null,
        image_urls: formImageUrls.length > 1 ? formImageUrls.slice(1) : [],
        event_id: formEventId || null,
        active: formActive ? 1 : 0,
        sort_order: parseInt(formSortOrder) || 0,
      };

      const url = editingProduct
        ? `${API}/api/shop/products/${editingProduct.id}`
        : `${API}/api/shop/products`;

      const res = await fetch(url, {
        method: editingProduct ? 'PUT' : 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success || res.ok) {
        setShowModal(false);
        fetchProducts();
      } else {
        const errMsg = json.error
          ? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error, null, 2))
          : 'Unknown error';
        alert('Failed to save product: ' + errMsg);
      }
    } catch (err) {
      console.error('Save product failed:', err);
      alert('Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Delete Product ─── */
  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/shop/products/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchProducts();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Update Order Status ─── */
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(orderId);
    try {
      const res = await fetch(`${API}/api/shop/orders/${orderId}/status`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
      }
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  /* ─── Stats ─── */
  const activeProducts = products.filter(p => p.active).length;
  const totalOrders = orders.length;
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'paid').length;

  /* ─── Render ─── */
  return (
    <div className="bg-[#fafafa] min-h-full">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Shop Management</h1>
          <p className="text-sm text-[#86868b] mt-1">
            Manage products and orders for the Champions Locker
          </p>
        </div>
        {tab === 'products' && (
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 mt-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#1d1d1f]">{products.length}</div>
            <div className="text-xs text-[#86868b] mt-1">Total Products</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#003e79]">{activeProducts}</div>
            <div className="text-xs text-[#86868b] mt-1">Active Products</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{fmtPrice(totalRevenue)}</div>
            <div className="text-xs text-[#86868b] mt-1">Total Revenue</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{pendingOrders}</div>
            <div className="text-xs text-[#86868b] mt-1">Pending / Paid Orders</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit">
          {(['products', 'orders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              {t === 'products' ? `Products (${products.length})` : `Orders (${orders.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ═══════════ Products Tab ═══════════ */}
        {tab === 'products' && (
          <>
            {loadingProducts ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <div className="text-4xl mb-3">🏒</div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">No products yet</h3>
                <p className="text-sm text-[#86868b] mt-1 mb-4">
                  Add your first product to the Champions Locker
                </p>
                <button
                  onClick={openAddModal}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition"
                >
                  + Add Product
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {products
                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => openEditModal(p)}
                      className={`bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition group ${
                        !p.active ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Image */}
                      <div className="aspect-square bg-[#f5f5f7] relative overflow-hidden">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#c7c7cc]">
                            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* Active badge */}
                        <div className="absolute top-2 right-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {p.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-[#1d1d1f] line-clamp-1">{p.name}</h3>
                          <span className="text-sm font-bold text-[#003e79] whitespace-nowrap">
                            {fmtPrice(p.price)}
                          </span>
                        </div>
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            CATEGORY_COLORS[p.category.toLowerCase()] || 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}
                        >
                          {p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                        </span>
                        {p.description && (
                          <p className="text-xs text-[#86868b] mt-2 line-clamp-2">{p.description}</p>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f0f0f0]">
                          <span className="text-[10px] text-[#86868b]">Sort: {p.sort_order || 0}</span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteTarget(p);
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-medium transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════ Orders Tab ═══════════ */}
        {tab === 'orders' && (
          <>
            {loadingOrders ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                <div className="text-4xl mb-3">📦</div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">No orders yet</h3>
                <p className="text-sm text-[#86868b] mt-1">
                  Orders will appear here when customers make purchases
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f5f5f7] text-left">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Order #</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Date</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Customer</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Items</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Total</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Status</th>
                        <th className="px-5 py-3 font-semibold text-[#6e6e73]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => {
                        const isExpanded = expandedOrder === order.id;
                        return (
                          <Fragment key={order.id}>
                            <tr
                              onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                              className="border-b border-gray-50 hover:bg-[#f5f5f7] transition cursor-pointer"
                            >
                              <td className="px-5 py-3 font-mono text-xs font-medium text-[#1d1d1f]">
                                {order.id.slice(0, 8).toUpperCase()}
                              </td>
                              <td className="px-5 py-3 text-[#6e6e73] text-xs">
                                {fmtDate(order.created_at)}
                              </td>
                              <td className="px-5 py-3">
                                <div className="font-medium text-[#1d1d1f] text-xs">
                                  {order.shipping_name || order.user_name || 'Unknown'}
                                </div>
                                {order.user_email && (
                                  <div className="text-[11px] text-[#86868b]">{order.user_email}</div>
                                )}
                              </td>
                              <td className="px-5 py-3 text-[#6e6e73] text-xs">
                                {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                              </td>
                              <td className="px-5 py-3 font-semibold text-[#1d1d1f]">
                                {fmtPrice(order.total)}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    STATUS_COLORS[order.status] || STATUS_COLORS.pending
                                  }`}
                                >
                                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                                <select
                                  value={order.status}
                                  onChange={e => handleStatusChange(order.id, e.target.value)}
                                  disabled={updatingStatus === order.id}
                                  className="px-2 py-1 rounded-lg border border-[#e8e8ed] text-xs bg-white focus:border-[#003e79] outline-none disabled:opacity-50"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="paid">Paid</option>
                                  <option value="shipped">Shipped</option>
                                  <option value="delivered">Delivered</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </td>
                            </tr>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <tr className="bg-[#fafafa]">
                                <td colSpan={7} className="px-5 py-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Shipping address */}
                                    <div>
                                      <h4 className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide mb-2">
                                        Shipping Address
                                      </h4>
                                      <div className="bg-white rounded-lg border border-[#e8e8ed] p-3 text-xs text-[#1d1d1f]">
                                        <div className="font-medium">{order.shipping_name || 'N/A'}</div>
                                        <div>{order.shipping_address || 'N/A'}</div>
                                        <div>
                                          {[order.shipping_city, order.shipping_state, order.shipping_zip]
                                            .filter(Boolean)
                                            .join(', ') || 'N/A'}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Order items */}
                                    <div>
                                      <h4 className="text-xs font-semibold text-[#6e6e73] uppercase tracking-wide mb-2">
                                        Items
                                      </h4>
                                      <div className="bg-white rounded-lg border border-[#e8e8ed] divide-y divide-[#f0f0f0]">
                                        {order.items?.map((item, idx) => (
                                          <div key={item.id || idx} className="p-3 flex items-center gap-3">
                                            {item.image_url ? (
                                              <img
                                                src={item.image_url}
                                                alt={item.product_name}
                                                className="w-10 h-10 rounded-lg object-cover"
                                              />
                                            ) : (
                                              <div className="w-10 h-10 rounded-lg bg-[#f5f5f7] flex items-center justify-center text-[#c7c7cc] text-xs">
                                                N/A
                                              </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium text-[#1d1d1f] truncate">
                                                {item.product_name}
                                              </div>
                                              <div className="text-[11px] text-[#86868b]">
                                                Qty: {item.quantity}
                                                {item.size ? ` | Size: ${item.size}` : ''}
                                              </div>
                                            </div>
                                            <div className="text-xs font-semibold text-[#1d1d1f]">
                                              {fmtPrice(item.price_cents * item.quantity)}
                                            </div>
                                          </div>
                                        ))}
                                        {(!order.items || order.items.length === 0) && (
                                          <div className="p-3 text-xs text-[#86868b] text-center">
                                            No item details available
                                          </div>
                                        )}
                                      </div>

                                      {/* Totals */}
                                      <div className="mt-2 bg-white rounded-lg border border-[#e8e8ed] p-3 text-xs">
                                        <div className="flex justify-between mb-1">
                                          <span className="text-[#86868b]">Subtotal</span>
                                          <span className="text-[#1d1d1f]">{fmtPrice(order.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between mb-1">
                                          <span className="text-[#86868b]">Shipping</span>
                                          <span className="text-[#1d1d1f]">{fmtPrice(order.shipping)}</span>
                                        </div>
                                        <div className="flex justify-between pt-1 border-t border-[#f0f0f0] font-semibold">
                                          <span className="text-[#1d1d1f]">Total</span>
                                          <span className="text-[#003e79]">{fmtPrice(order.total)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════ Product Modal ═══════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white px-6 pt-5 pb-3 border-b border-[#e8e8ed] flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-[#1d1d1f]">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full hover:bg-[#f5f5f7] flex items-center justify-center transition text-[#86868b]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Product Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. UHT Championship Beanie"
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Product description..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none resize-none"
                />
              </div>

              {/* Price + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="29.99"
                    className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm bg-white focus:border-[#003e79] outline-none"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Image upload (multiple) */}
              <div>
                <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Product Images</label>
                {formImageUrls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {formImageUrls.map((url, idx) => (
                      <div key={idx} className="relative inline-block">
                        <img
                          src={url}
                          alt={`Preview ${idx + 1}`}
                          className="w-24 h-24 rounded-lg object-cover border border-[#e8e8ed] cursor-pointer hover:ring-2 hover:ring-[#003e79] transition"
                          onClick={() => setLightboxImage(url)}
                        />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                        >
                          x
                        </button>
                        {idx === 0 && (
                          <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">Main</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <label className="block">
                  <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#c7c7cc] text-sm text-[#6e6e73] cursor-pointer hover:border-[#003e79] hover:text-[#003e79] transition ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Add images'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-[#86868b] mt-1">First image is the main product image. Upload multiple for gallery.</p>
              </div>

              {/* Event (optional) */}
              <div>
                <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Event (optional)</label>
                <select
                  value={formEventId}
                  onChange={e => setFormEventId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm bg-white focus:border-[#003e79] outline-none"
                >
                  <option value="">No specific event</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>

              {/* Sort Order + Active */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#6e6e73] mb-1">Sort Order</label>
                  <input
                    type="number"
                    min="0"
                    value={formSortOrder}
                    onChange={e => setFormSortOrder(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#e8e8ed] text-sm focus:border-[#003e79] focus:ring-1 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setFormActive(!formActive)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        formActive ? 'bg-cyan-600' : 'bg-[#e8e8ed]'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          formActive ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                    <span className="text-sm text-[#1d1d1f] font-medium">
                      {formActive ? 'Active' : 'Inactive'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-[#e8e8ed] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-[#e8e8ed] text-sm font-medium text-[#6e6e73] hover:bg-[#f5f5f7] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={saving || !formName.trim() || !formPrice.trim()}
                className="px-5 py-2 bg-[#003e79] hover:bg-[#00315f] text-white font-semibold rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ Delete Confirmation ═══════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">Delete Product</h3>
            <p className="text-sm text-[#6e6e73] mb-5">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-[#e8e8ed] text-sm font-medium text-[#6e6e73] hover:bg-[#f5f5f7] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProduct}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ═══════════ Image Lightbox ═══════════ */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-xl transition"
          >
            &times;
          </button>
          <img
            src={lightboxImage}
            alt="Full size preview"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {/* Navigation arrows if in edit modal */}
          {formImageUrls.length > 1 && (() => {
            const currentIdx = formImageUrls.indexOf(lightboxImage);
            if (currentIdx < 0) return null;
            return (
              <>
                {currentIdx > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setLightboxImage(formImageUrls[currentIdx - 1]); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-2xl transition"
                  >
                    &#8249;
                  </button>
                )}
                {currentIdx < formImageUrls.length - 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setLightboxImage(formImageUrls[currentIdx + 1]); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-2xl transition"
                  >
                    &#8250;
                  </button>
                )}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                  {currentIdx + 1} of {formImageUrls.length}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

