'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { Product, ProductType } from '@/types';
import Image from 'next/image';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Loader2, Plus, Edit2, Trash2, X, Upload, Check, ShoppingBag } from 'lucide-react';

const DIGITAL_SUBCATEGORIES = [
  { value: 'stems', label: 'Stems / Multitracks' },
  { value: 'instrumentals', label: 'Instrumentals / Beats' },
  { value: 'sample-packs', label: 'Sample Packs' },
  { value: 'acapellas', label: 'Acapellas' },
  { value: 'preset-packs', label: 'Preset Packs' },
  { value: 'lyric-book', label: 'Lyric Book / Songwriting Breakdown' },
  { value: 'digital-art', label: 'Digital Art / Wallpapers' },
  { value: 'video-content', label: 'Video Content' },
];

const PHYSICAL_SUBCATEGORIES = [
  { value: 'merch', label: 'Merch (T-Shirts, Hoodies, etc.)' },
  { value: 'vinyl', label: 'Vinyl Records' },
  { value: 'cd', label: 'CDs' },
  { value: 'poster', label: 'Posters / Art Prints' },
  { value: 'other-physical', label: 'Other Physical Product' },
];

const EXPERIENCE_SUBCATEGORIES = [
  { value: 'video-call', label: '1-on-1 Video Call' },
  { value: 'custom-verse', label: 'Custom Verse / Feature' },
  { value: 'song-critique', label: 'Song Critique / Feedback' },
  { value: 'shoutout', label: 'Personalized Shoutout' },
  { value: 'in-person', label: 'In-Person Experience' },
];

export function ShopManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productType, setProductType] = useState<ProductType>('digital');
  const [subcategory, setSubcategory] = useState('');
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<{id: string; name: string; price: number}[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageFile: null as File | null,
    productFile: null as File | null,
    productFileName: '',
    imageUrl: '',
    price: '',
    isFree: true,
    allowedTierIds: [] as string[],
    // Subcategory-specific fields
    bpm: '',
    key: '',
    compatibleDaws: '',
    turnaroundDays: '',
    submissionInstructions: '',
    location: '',
    durationField: '',
    maxQuantity: '',
    expiresAt: '',
    variants: [] as { label: string; options: string[] }[],
  });

  const [selectedBundleItems, setSelectedBundleItems] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const platformLimits = usePlatformLimits(artistProfileId);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id, slug')
      .eq('user_id', user.id)
      .maybeSingle();

    setArtistProfileId(artistProfile?.id || null);
    setArtistProfileId(artistProfile?.id || null);
    if (!artistProfile) {
      setIsLoading(false);
      return;
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (productsData) {
      setProducts(productsData as Product[]);
    }

    const { data: allProducts } = await supabase
      .from('products')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true)
      .neq('type', 'bundle')
      .order('title');

    if (allProducts) {
      setExistingProducts(allProducts as Product[]);
    }

    // Fetch subscription tiers
    const { data: tiersData, error: tiersError } = await supabase
      .from('subscription_tiers')
      .select('id, name, price')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true)
      .order('price', { ascending: true });
    if (tiersError) {
      console.error('Error fetching tiers:', tiersError);
    } else if (tiersData) {
      setTiers(tiersData);
    }

    setIsLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      setArtistProfileId(artistProfile?.id || null);
    setArtistProfileId(artistProfile?.id || null);
    if (!artistProfile) {
        showToast('Artist profile not found', 'error');
        return;
      }

      let imageUrl = formData.imageUrl;

      if (formData.imageFile) {
        const ext = formData.imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${artistProfile.id}/products/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('album-art')
          .upload(path, formData.imageFile);
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('album-art')
            .getPublicUrl(path);
          imageUrl = publicUrl;
        }
      }

      // Store subcategory in description as JSON for now (or create separate column)
      const extraData: Record<string, string> = {};
      if (subcategory) extraData.subcategory = subcategory;
      // Upload product file for digital products
      let fileUrl: string | null = null;
      if (formData.productFile && productType === 'digital') {
        const ext = formData.productFile.name.split('.').pop();
        const fileName = `${Date.now()}-product.${ext}`;
        const path = `${artistProfile.id}/product-files/${fileName}`;
        const { error: fileUploadError } = await supabase.storage
          .from('album-art')
          .upload(path, formData.productFile);
        if (!fileUploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('album-art')
            .getPublicUrl(path);
          fileUrl = publicUrl;
        }
      }

      if (formData.bpm) extraData.bpm = formData.bpm;
      if (formData.key) extraData.key = formData.key;
      if (formData.compatibleDaws) extraData.compatible_daws = formData.compatibleDaws;
      if (formData.turnaroundDays) extraData.turnaround_days = formData.turnaroundDays;
      if (formData.submissionInstructions) extraData.submission_instructions = formData.submissionInstructions;
      if (formData.location) extraData.location = formData.location;
      if (formData.durationField) extraData.duration = formData.durationField;

      const descriptionWithExtra = false 
        ? formData.description
        : formData.description;

      const productData = {
        artist_id: artistProfile.id,
        title: formData.title,
        description: descriptionWithExtra || null,
        image_url: imageUrl || null,
        type: productType,
        price: Math.round(parseFloat(formData.price) * 100) || 0,
        access_level: 'public',
        is_free: formData.isFree,
        allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds,
        delivery_type: productType === 'experience' ? 'scheduled' : productType === 'physical' ? 'shipped' : 'instant',
        file_url: fileUrl || (editingProduct?.file_url ?? null),
        duration_minutes: formData.durationField ? parseInt(formData.durationField) : null,
        max_quantity: formData.maxQuantity ? parseInt(formData.maxQuantity) : null,
        expires_at: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        variants: productType === 'physical' && formData.variants.length > 0 ? formData.variants : null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({ ...productData, updated_at: new Date().toISOString() })
          .eq('id', editingProduct.id);

        if (error) throw error;

        if (productType === 'bundle') {
          await supabase.from('bundle_items').delete().eq('bundle_id', editingProduct.id);
          for (const productId of selectedBundleItems) {
            await supabase.from('bundle_items').insert({
              bundle_id: editingProduct.id,
              product_id: productId,
            });
          }
        }

        showToast('Product updated!', 'success');
      } else {
        const { data: product, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single();

        if (error) throw error;

        if (productType === 'bundle' && product) {
          for (const productId of selectedBundleItems) {
            await supabase.from('bundle_items').insert({
              bundle_id: product.id,
              product_id: productId,
            });
          }
        }

        showToast('Product created!', 'success');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving product:', error);
      showToast('Failed to save product', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setProductType(product.type);
    
    // Parse subcategory from description if stored
    let parsedSubcategory = '';
    let extraData: Record<string, string> = {};
    if (product.description?.includes('<!--EXTRA:')) {
      const match = product.description.match(/<!--EXTRA:({.*?})-->/);
      if (match) {
        try {
          extraData = JSON.parse(match[1]);
          parsedSubcategory = extraData.subcategory || '';
        } catch {}
      }
    }
    setSubcategory(parsedSubcategory);
    
    setFormData({
      title: product.title,
      description: product.description?.replace(/<!--EXTRA:.*?-->/, '') || '',
      imageFile: null,
      imageUrl: product.image_url || '',
      price: (product.price / 100).toString(),
      isFree: product.is_free !== false,
      allowedTierIds: product.allowed_tier_ids || [],
      bpm: extraData.bpm || '',
      key: extraData.key || '',
      compatibleDaws: extraData.compatible_daws || '',
      turnaroundDays: extraData.turnaround_days || '',
      submissionInstructions: extraData.submission_instructions || '',
      location: extraData.location || '',
      durationField: product.duration_minutes?.toString() || '',
      productFile: null,
      productFileName: product.file_url ? product.file_url.split('/').pop() || 'Existing file' : '',
      maxQuantity: product.max_quantity?.toString() || '',
      variants: product.variants || [],
      expiresAt: product.expires_at ? new Date(product.expires_at).toISOString().slice(0, 16) : '',
    });

    if (product.type === 'bundle') {
      async function loadBundleItems() {
        const { data } = await supabase
          .from('bundle_items')
          .select('product_id')
          .eq('bundle_id', product.id);
        if (data) {
          setSelectedBundleItems(data.map(d => d.product_id));
        }
      }
      loadBundleItems();
    }

    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingProductId) return;

    await supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', deletingProductId);

    loadData();
    setShowDeleteModal(false);
    setDeletingProductId(null);
  };

  const confirmDelete = (productId: string) => {
    setDeletingProductId(productId);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setSelectedBundleItems([]);
    setProductType('digital');
    // productFile reset handled in formData reset
    setSubcategory('');
    setFormData({
      title: '',
      description: '',
      imageFile: null,
      productFile: null,
      productFileName: '',
      imageUrl: '',
      price: '',
      isFree: true,
      allowedTierIds: [],
      bpm: '',
      key: '',
      compatibleDaws: '',
      turnaroundDays: '',
      submissionInstructions: '',
      location: '',
      durationField: '',
      maxQuantity: '',
      expiresAt: '',
      variants: [],
    });
  };

  const getTypeBadge = (type: ProductType) => {
    const colors: Record<ProductType, string> = {
      digital: 'bg-blue-500/20 text-blue-400',
      experience: 'bg-purple-500/20 text-purple-400',
      bundle: 'bg-crwn-gold/20 text-crwn-gold',
      physical: 'bg-green-500/20 text-green-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getSubcategoryBadge = (description: string | null) => {
    if (!description?.includes('<!--EXTRA:')) return null;
    const match = description.match(/<!--EXTRA:({.*?})-->/);
    if (!match) return null;
    try {
      const extra = JSON.parse(match[1]);
      if (!extra.subcategory) return null;
      const label = [...DIGITAL_SUBCATEGORIES, ...EXPERIENCE_SUBCATEGORIES, ...PHYSICAL_SUBCATEGORIES].find(s => s.value === extra.subcategory)?.label;
      return label ? (
        <span className="px-2 py-0.5 rounded text-xs bg-crwn-elevated text-crwn-text-secondary">
          {label}
        </span>
      ) : null;
    } catch {
      return null;
    }
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="stagger-fade-in space-y-6" data-tour="shop-create">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-crwn-text">Shop</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 neu-button-accent text-crwn-bg hover-glow"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="relative md:fixed md:inset-0 md:bg-black/50 md:flex md:items-center md:justify-center md:z-50 md:p-8">
          <div className="bg-crwn-surface p-6 w-full md:rounded-xl md:max-w-2xl md:max-h-[80vh] md:overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-crwn-text">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h3>
              <button onClick={resetForm} className="text-crwn-text-secondary hover:text-crwn-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type Selector */}
            <div className="flex gap-2 mb-6">
              {(['digital', 'experience', 'bundle', 'physical'] as ProductType[]).filter(t => t !== 'bundle' || platformLimits.limits.bundles).map((type) => (
                <button
                  key={type}
                  onClick={() => { setProductType(type); setSubcategory(''); }}
                  className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                    productType === type
                      ? 'bg-crwn-gold text-crwn-bg'
                      : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Subcategory Selector */}
            {productType !== 'bundle' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Category</label>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                >
                  <option value="">Select a category</option>
                  {productType === 'digital' && DIGITAL_SUBCATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                  {productType === 'experience' && EXPERIENCE_SUBCATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                  {productType === 'physical' && PHYSICAL_SUBCATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Always shown fields */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text resize-none"
                />
              </div>

              {/* Image */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Image</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                    {formData.imageFile ? (
                      <Image src={URL.createObjectURL(formData.imageFile)} alt="" width={96} height={96} className="object-cover" />
                    ) : formData.imageUrl ? (
                      <Image src={formData.imageUrl} alt="" width={96} height={96} className="object-cover" />
                    ) : (
                      <span className="text-3xl">📦</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setFormData(p => ({ ...p, imageFile: e.target.files?.[0] || null }))}
                    />
                  </label>
                </div>
              </div>

              {/* Digital Product File Upload */}
              {productType === 'digital' && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Product File</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 neu-inset px-4 py-3 text-sm text-crwn-text-secondary truncate">
                      {formData.productFile ? formData.productFile.name : formData.productFileName || 'No file selected'}
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer whitespace-nowrap">
                      <Upload className="w-4 h-4" />
                      {formData.productFile || formData.productFileName ? 'Change' : 'Upload'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => setFormData(p => ({ ...p, productFile: e.target.files?.[0] || null }))}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-crwn-text-dim mt-1">Upload the file your fans will receive after purchase (ZIP, PDF, WAV, MP3, etc.)</p>
                </div>
              )}

              {/* Experience Delivery Info */}
              {productType === 'experience' && (
                <>
                {!platformLimits.limits.scheduling && (
                  <div className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-lg p-3 mb-3">
                    <p className="text-sm text-crwn-gold">
                      1-on-1 scheduling requires a Pro plan or higher. <a href="/profile/artist?tab=billing" className="underline font-semibold">Upgrade now</a>
                    </p>
                  </div>
                )}
                {!platformLimits.limits.scheduling && (
                  <div className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-lg p-3 mb-3">
                    <p className="text-sm text-crwn-gold">
                      1-on-1 scheduling requires a Pro plan or higher. <a href="/profile/artist?tab=billing" className="underline font-semibold">Upgrade now</a>
                    </p>
                  </div>
                )}
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 mb-3">
                  <p className="text-sm text-purple-300">
                    Fans who purchase this will receive a booking token and access to your Cal.com scheduling link. Make sure you{"'"}ve set your Cal.com link in your <a href="/profile/artist?tab=profile" className="text-crwn-gold underline">Profile Settings</a>.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Note to Fan (optional)</label>
                  <textarea
                    value={formData.submissionInstructions}
                    onChange={(e) => setFormData(p => ({ ...p, submissionInstructions: e.target.value }))}
                    rows={2}
                    placeholder="Any additional details for the fan after purchase (e.g. 'Looking forward to connecting with you!')"
                    className="w-full neu-inset px-4 py-2 text-crwn-text resize-none"
                  />
                </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(p => ({ ...p, price: e.target.value }))}
                    className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg pl-8 pr-4 py-2 text-crwn-text"
                    required
                  />
                </div>
              </div>

              {/* Tier Gating */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-2">Access</label>
                <div className="space-y-2 bg-crwn-bg border border-crwn-elevated rounded-lg p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFree}
                      onChange={(e) => setFormData(p => ({ 
                        ...p, 
                        isFree: e.target.checked,
                        allowedTierIds: e.target.checked ? [] : p.allowedTierIds,
                      }))}
                      className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                    />
                    <span className="text-crwn-text text-sm">Free to all</span>
                  </label>
                  {!formData.isFree && tiers.length > 0 && tiers.map(tier => (
                    <label key={tier.id} className="flex items-center gap-2 cursor-pointer ml-6">
                      <input
                        type="checkbox"
                        checked={formData.allowedTierIds.includes(tier.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...formData.allowedTierIds, tier.id]
                            : formData.allowedTierIds.filter(id => id !== tier.id);
                          setFormData(p => ({ ...p, allowedTierIds: ids }));
                        }}
                        className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                      />
                      <span className="text-crwn-text text-sm">{tier.name} (${(tier.price / 100).toFixed(0)}/mo)</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* DIGITAL: Instrumentals */}
              {subcategory === 'instrumentals' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">BPM</label>
                    <input
                      type="number"
                      value={formData.bpm}
                      onChange={(e) => setFormData(p => ({ ...p, bpm: e.target.value }))}
                      placeholder="e.g. 140"
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Key</label>
                    <input
                      type="text"
                      value={formData.key}
                      onChange={(e) => setFormData(p => ({ ...p, key: e.target.value }))}
                      placeholder="e.g. C Minor"
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                </div>
              )}

              {/* DIGITAL: Preset Packs */}
              {subcategory === 'preset-packs' && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Compatible DAWs</label>
                  <input
                    type="text"
                    value={formData.compatibleDaws}
                    onChange={(e) => setFormData(p => ({ ...p, compatibleDaws: e.target.value }))}
                    placeholder="e.g. Serum, Massive"
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  />
                </div>
              )}

              {/* DIGITAL: Video Content */}
              {subcategory === 'video-content' && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.durationField}
                    onChange={(e) => setFormData(p => ({ ...p, durationField: e.target.value }))}
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  />
                </div>
              )}

              {/* EXPERIENCE: 1-on-1 Video Call */}
              {subcategory === 'video-call' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      min="15"
                      value={formData.durationField}
                      onChange={(e) => setFormData(p => ({ ...p, durationField: e.target.value }))}
                      placeholder="e.g. 60"
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Max Spots</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.maxQuantity}
                      onChange={(e) => setFormData(p => ({ ...p, maxQuantity: e.target.value }))}
                      placeholder="Unlimited"
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                </div>
              )}

              {/* Expiration date for any product type */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Available Until (optional)</label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData(p => ({ ...p, expiresAt: e.target.value }))}
                  className="w-full neu-inset px-4 py-2 text-crwn-text"
                />
                <p className="text-xs text-crwn-text-secondary mt-1">Leave blank for no expiration</p>
              </div>

              {/* EXPERIENCE: Custom Verse, Song Critique, Shoutout */}
              {['custom-verse', 'song-critique', 'shoutout'].includes(subcategory) && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Turnaround (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.turnaroundDays}
                    onChange={(e) => setFormData(p => ({ ...p, turnaroundDays: e.target.value }))}
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  />
                </div>
              )}

              {/* EXPERIENCE: Song Critique */}
              {subcategory === 'song-critique' && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Submission Instructions</label>
                  <textarea
                    value={formData.submissionInstructions}
                    onChange={(e) => setFormData(p => ({ ...p, submissionInstructions: e.target.value }))}
                    rows={2}
                    placeholder="How should the fan submit their song?"
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text resize-none"
                  />
                </div>
              )}

              {/* EXPERIENCE: In-Person */}
              {subcategory === 'in-person' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData(p => ({ ...p, location: e.target.value }))}
                      placeholder="City or venue"
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Max Spots</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.maxQuantity}
                      onChange={(e) => setFormData(p => ({ ...p, maxQuantity: e.target.value }))}
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                </div>
              )}

              {/* BUNDLE: Select products */}
              {productType === 'bundle' && existingProducts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-2">Include Products</label>
                  <div className="max-h-40 overflow-y-auto bg-crwn-bg rounded-lg p-2 space-y-1">
                    {existingProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedBundleItems(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        )}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${
                          selectedBundleItems.includes(p.id)
                            ? 'bg-crwn-gold/20 text-crwn-text'
                            : 'text-crwn-text-secondary hover:bg-crwn-elevated'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          selectedBundleItems.includes(p.id) ? 'bg-crwn-gold border-crwn-gold' : 'border-crwn-text-secondary'
                        }`}>
                          {selectedBundleItems.includes(p.id) && <Check className="w-3 h-3 text-crwn-bg" />}
                        </div>
                        <span className="flex-1 text-left">{p.title}</span>
                        <span className="text-xs">${(p.price / 100).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 neu-button-accent text-crwn-bg disabled:opacity-50 hover-glow"
              >
                {isLoading ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated group">
              <div className="aspect-square relative bg-crwn-elevated">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    {product.type === 'digital' ? '💾' : product.type === 'experience' ? '🎫' : '📦'}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => handleEdit(product)} className="p-2 bg-crwn-gold rounded-full">
                    <Edit2 className="w-4 h-4 text-crwn-bg" />
                  </button>
                  <button onClick={() => confirmDelete(product.id)} className="p-2 bg-crwn-error rounded-full">
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  {getTypeBadge(product.type)}
                  {getSubcategoryBadge(product.description)}
                </div>
                <h3 className="font-medium text-crwn-text truncate">{product.title}</h3>
                <p className="text-sm text-crwn-text-secondary">
                  ${(product.price / 100).toFixed(2)} • {product.quantity_sold} sold
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-crwn-gold/10 flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-6 h-6 text-crwn-gold" />
          </div>
          <p className="text-crwn-text font-medium mb-1">No products yet</p>
          <p className="text-crwn-text-secondary text-sm mb-4">Sell beats, samples, merch, and more to your fans</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-crwn-gold text-crwn-bg font-semibold rounded-full hover:bg-crwn-gold-hover transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Your First Product
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setDeletingProductId(null); }}
      />
    </div>
  );
}
