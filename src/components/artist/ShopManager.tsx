'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Product, ProductType } from '@/types';
import Image from 'next/image';
import { Loader2, Plus, Edit2, Trash2, X, Upload, Check } from 'lucide-react';

export function ShopManager() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productType, setProductType] = useState<ProductType>('digital');
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageFile: null as File | null,
    imageUrl: '',
    price: '',
    deliveryType: 'instant' as 'instant' | 'scheduled' | 'custom',
    fileUrl: '',
    durationMinutes: '',
    maxQuantity: '',
  });

  const [selectedBundleItems, setSelectedBundleItems] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;

    // Get artist profile
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artistProfile) {
      setIsLoading(false);
      return;
    }

    // Load products
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (productsData) {
      setProducts(productsData as Product[]);
    }

    // Load existing products for bundles
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

      if (!artistProfile) {
        alert('Artist profile not found');
        return;
      }

      let imageUrl = formData.imageUrl;

      // Upload image if provided
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

      const productData = {
        artist_id: artistProfile.id,
        title: formData.title,
        description: formData.description || null,
        image_url: imageUrl || null,
        type: productType,
        price: Math.round(parseFloat(formData.price) * 100) || 0,
        access_level: 'public',
        delivery_type: formData.deliveryType,
        file_url: formData.fileUrl || null,
        duration_minutes: formData.durationMinutes ? parseInt(formData.durationMinutes) : null,
        max_quantity: formData.maxQuantity ? parseInt(formData.maxQuantity) : null,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({ ...productData, updated_at: new Date().toISOString() })
          .eq('id', editingProduct.id);

        if (error) throw error;

        // Update bundle items
        if (productType === 'bundle') {
          await supabase.from('bundle_items').delete().eq('bundle_id', editingProduct.id);
          for (const productId of selectedBundleItems) {
            await supabase.from('bundle_items').insert({
              bundle_id: editingProduct.id,
              product_id: productId,
            });
          }
        }

        alert('Product updated!');
      } else {
        const { data: product, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single();

        if (error) throw error;

        // Add bundle items
        if (productType === 'bundle' && product) {
          for (const productId of selectedBundleItems) {
            await supabase.from('bundle_items').insert({
              bundle_id: product.id,
              product_id: productId,
            });
          }
        }

        alert('Product created!');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setProductType(product.type);
    setFormData({
      title: product.title,
      description: product.description || '',
      imageFile: null,
      imageUrl: product.image_url || '',
      price: (product.price / 100).toString(),
      deliveryType: product.delivery_type,
      fileUrl: product.file_url || '',
      durationMinutes: product.duration_minutes?.toString() || '',
      maxQuantity: product.max_quantity?.toString() || '',
    });

    // Load bundle items
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

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    await supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', productId);

    loadData();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setSelectedBundleItems([]);
    setProductType('digital');
    setFormData({
      title: '',
      description: '',
      imageFile: null,
      imageUrl: '',
      price: '',
      deliveryType: 'instant',
      fileUrl: '',
      durationMinutes: '',
      maxQuantity: '',
    });
  };

  const getTypeBadge = (type: ProductType) => {
    const colors = {
      digital: 'bg-blue-500/20 text-blue-400',
      experience: 'bg-purple-500/20 text-purple-400',
      bundle: 'bg-crwn-gold/20 text-crwn-gold',
    };
    const labels = {
      digital: 'Digital',
      experience: 'Experience',
      bundle: 'Bundle',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type]}`}>
        {labels[type]}
      </span>
    );
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-crwn-text">Shop</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-crwn-surface rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
              {(['digital', 'experience', 'bundle'] as ProductType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setProductType(type)}
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text resize-none"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                    Price (USD)
                  </label>
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

                {productType === 'experience' && (
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData(p => ({ ...p, durationMinutes: e.target.value }))}
                      className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                    />
                  </div>
                )}

                {productType !== 'bundle' && (
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Delivery</label>
                    <select
                      value={formData.deliveryType}
                      onChange={(e) => setFormData(p => ({ ...p, deliveryType: e.target.value as 'instant' | 'scheduled' | 'custom' }))}
                      className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                    >
                      <option value="instant">Instant Download</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="custom">Custom / Contact</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Max Quantity (optional)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxQuantity}
                    onChange={(e) => setFormData(p => ({ ...p, maxQuantity: e.target.value }))}
                    placeholder="Unlimited"
                    className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  />
                </div>
              </div>

              {productType === 'digital' && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">File URL (or leave blank)</label>
                  <input
                    type="url"
                    value={formData.fileUrl}
                    onChange={(e) => setFormData(p => ({ ...p, fileUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  />
                </div>
              )}

              {/* Bundle Items Selection */}
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
                className="w-full py-3 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover disabled:opacity-50"
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
                  <button onClick={() => handleDelete(product.id)} className="p-2 bg-crwn-error rounded-full">
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  {getTypeBadge(product.type)}
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
        <div className="text-center py-12 text-crwn-text-secondary">
          No products yet. Add your first product!
        </div>
      )}
    </div>
  );
}
