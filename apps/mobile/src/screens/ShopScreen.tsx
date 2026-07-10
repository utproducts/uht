import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { authFetch, getUser } from '../services/auth';
import ScreenHeader from '../components/ScreenHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2;

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  image_urls: string | null;
  event_id: string | null;
  event_name?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type Screen = 'browse' | 'detail' | 'cart' | 'checkout' | 'orders';

const CATEGORIES = ['All', 'Beanies', 'Hats', 'Blankets', 'Pins'];

export default function ShopScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Navigation
  const [screen, setScreen] = useState<Screen>('browse');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Detail view
  const [detailMainImage, setDetailMainImage] = useState<string | null>(null);
  const [detailQty, setDetailQty] = useState(1);

  // Checkout
  const [shipping, setShipping] = useState({
    name: '', address: '', city: '', state: '', zip: '',
  });
  const [processing, setProcessing] = useState(false);

  // Orders
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Team discount: $1 off per item when buying 10+ of same product
  const TEAM_DISCOUNT_THRESHOLD = 10;
  const TEAM_DISCOUNT_AMOUNT = 1.00;

  const getItemPrice = (product: Product, quantity: number) => {
    if (quantity >= TEAM_DISCOUNT_THRESHOLD) {
      return Math.max(0, product.price - TEAM_DISCOUNT_AMOUNT);
    }
    return product.price;
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + getItemPrice(item.product, item.quantity) * item.quantity, 0);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await authFetch('/api/shop/products');
      const json = await res.json();
      if (json.success) setProducts(json.data || []);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter(p => p.category.toLowerCase() === selectedCategory.toLowerCase());

  const addToCart = (product: Product, qty: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, quantity: qty } : item
    ));
  };

  const handleCheckout = async () => {
    if (!shipping.name || !shipping.address || !shipping.city || !shipping.state || !shipping.zip) {
      Alert.alert('Missing Info', 'Please fill in all shipping fields.');
      return;
    }
    setProcessing(true);
    try {
      const user = await getUser();
      // Create order + get Stripe client secret
      const res = await authFetch('/api/shop/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(item => ({ productId: item.product.id, quantity: item.quantity })),
          shipping,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        Alert.alert('Error', json.error || 'Could not create order.');
        setProcessing(false);
        return;
      }

      const { clientSecret, orderId } = json.data;

      // Init Stripe Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Ultimate Hockey Tournaments',
        applePay: { merchantCountryCode: 'US' },
        defaultBillingDetails: { email: user?.email || '' },
        style: 'automatic',
      });

      if (initError) {
        Alert.alert('Payment Error', 'Could not set up payment. Please try again.');
        setProcessing(false);
        return;
      }

      // Present Payment Sheet
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') {
          setProcessing(false);
          return;
        }
        Alert.alert('Payment Failed', presentError.message || 'Payment could not be processed.');
        setProcessing(false);
        return;
      }

      // Success!
      setCart([]);
      setShipping({ name: '', address: '', city: '', state: '', zip: '' });
      setScreen('browse');
      Alert.alert('Order Placed!', 'Your order has been placed successfully. You\'ll receive a confirmation email shortly.');

    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await authFetch('/api/shop/orders/mine');
      const json = await res.json();
      if (json.success) setOrders(json.data || []);
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setOrdersLoading(false);
    }
  };

  // ═══════════════════ BROWSE SCREEN ═══════════════════
  const renderBrowse = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProducts(); }} tintColor={colors.cyan} />}
    >
      {/* Hero banner — full-bleed like HomeScreen */}
      <ImageBackground
        source={require('../../assets/shop-hero.png')}
        style={styles.heroBanner}
        resizeMode="cover"
      >
        {/* Dark overlay for text readability */}
        <View style={styles.heroOverlay} />
        {/* Bright cyan bottom edge */}
        <View style={styles.heroCyanEdge} />
        {/* Content */}
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>UHT LOCKER ROOM</Text>
          <Text style={styles.heroSubtitle}>Official gear & merchandise</Text>
          <View style={styles.heroDivider} />
          <Text style={styles.heroTagline}>Rep your team. Own the ice.</Text>
        </View>
      </ImageBackground>

      {/* Category pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryScrollContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* My Orders link */}
      <TouchableOpacity style={styles.ordersLink} onPress={() => { setScreen('orders'); fetchOrders(); }}>
        <Ionicons name="receipt-outline" size={18} color={colors.navy} />
        <Text style={styles.ordersLinkText}>My Orders</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Product grid */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.cyan} style={{ marginTop: 40 }} />
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>No products in this category yet.</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      ) : (
        <View style={styles.productGrid}>
          {filteredProducts.map(product => (
            <TouchableOpacity
              key={product.id}
              style={styles.productCard}
              onPress={() => { setSelectedProduct(product); setDetailMainImage(null); setDetailQty(1); setScreen('detail'); }}
              activeOpacity={0.7}
            >
              {product.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
              ) : (
                <View style={[styles.productImage, styles.productImagePlaceholder]}>
                  <Ionicons name="shirt-outline" size={40} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                {product.event_name && (
                  <Text style={styles.productEvent} numberOfLines={1}>{product.event_name}</Text>
                )}
                <View style={styles.productBottom}>
                  <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{product.category}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );

  // ═══════════════════ DETAIL SCREEN ═══════════════════
  const renderDetail = () => {
    if (!selectedProduct) return null;
    const inCart = cart.find(item => item.product.id === selectedProduct.id);
    const allImages: string[] = [];
    if (selectedProduct.image_url) allImages.push(selectedProduct.image_url);
    try {
      if (selectedProduct.image_urls) allImages.push(...JSON.parse(selectedProduct.image_urls));
    } catch {}
    const mainImage = detailMainImage || allImages[0] || null;

    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main image */}
        {mainImage ? (
          <Image source={{ uri: mainImage }} style={styles.detailImage} resizeMode="cover" />
        ) : (
          <View style={[styles.detailImage, styles.productImagePlaceholder]}>
            <Ionicons name="shirt-outline" size={60} color={colors.textMuted} />
          </View>
        )}

        {/* Thumbnail strip — all images, tappable */}
        {allImages.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll} contentContainerStyle={{ gap: spacing.sm }}>
            {allImages.map((url, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setDetailMainImage(url)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: url }}
                  style={[
                    styles.thumbImage,
                    mainImage === url && styles.thumbImageActive,
                  ]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Product info */}
        <View style={styles.detailInfo}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailName}>{selectedProduct.name}</Text>
            <Text style={styles.detailPrice}>${selectedProduct.price.toFixed(2)}</Text>
          </View>

          {selectedProduct.event_name && (
            <View style={styles.eventBadge}>
              <Ionicons name="trophy-outline" size={14} color={colors.navy} />
              <Text style={styles.eventBadgeText}>{selectedProduct.event_name}</Text>
            </View>
          )}

          <View style={styles.categoryBadgeLg}>
            <Text style={styles.categoryBadgeLgText}>{selectedProduct.category}</Text>
          </View>

          {selectedProduct.description ? (
            <Text style={styles.detailDescription}>{selectedProduct.description}</Text>
          ) : null}

          {/* Team discount banner */}
          <View style={styles.discountBanner}>
            <Ionicons name="people" size={18} color={colors.success} />
            <Text style={styles.discountBannerText}>
              Team Deal: Buy 10+ and save ${TEAM_DISCOUNT_AMOUNT.toFixed(2)} each!
            </Text>
          </View>

          {/* Quantity selector */}
          <View style={styles.qtySection}>
            <Text style={styles.qtySectionLabel}>Quantity</Text>
            <View style={styles.qtySelector}>
              <TouchableOpacity
                style={[styles.qtySelectorBtn, detailQty <= 1 && { opacity: 0.4 }]}
                onPress={() => setDetailQty(q => Math.max(1, q - 1))}
                disabled={detailQty <= 1}
              >
                <Ionicons name="remove" size={20} color={colors.navy} />
              </TouchableOpacity>
              <Text style={styles.qtySelectorText}>{detailQty}</Text>
              <TouchableOpacity
                style={styles.qtySelectorBtn}
                onPress={() => setDetailQty(q => q + 1)}
              >
                <Ionicons name="add" size={20} color={colors.navy} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick team presets */}
          <View style={styles.presetRow}>
            {[1, 5, 10, 15, 20, 25].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.presetBtn, detailQty === n && styles.presetBtnActive]}
                onPress={() => setDetailQty(n)}
              >
                <Text style={[styles.presetBtnText, detailQty === n && styles.presetBtnTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Price breakdown */}
          {detailQty >= TEAM_DISCOUNT_THRESHOLD && (
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text style={styles.priceRowLabel}>Regular price</Text>
                <Text style={styles.priceRowStrike}>${(selectedProduct.price * detailQty).toFixed(2)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceRowLabel, { color: colors.success }]}>Team discount (-${TEAM_DISCOUNT_AMOUNT.toFixed(2)}/ea)</Text>
                <Text style={[styles.priceRowValue, { color: colors.success }]}>-${(TEAM_DISCOUNT_AMOUNT * detailQty).toFixed(2)}</Text>
              </View>
              <View style={[styles.priceRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                <Text style={styles.priceRowBold}>Total</Text>
                <Text style={styles.priceRowBold}>${(getItemPrice(selectedProduct, detailQty) * detailQty).toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Add to Cart button */}
          <TouchableOpacity
            style={styles.addToCartBtn}
            onPress={() => {
              addToCart(selectedProduct, detailQty);
              Alert.alert('Added!', `${detailQty}x ${selectedProduct.name} added to cart.`);
              setDetailQty(1);
            }}
          >
            <Ionicons name="cart-outline" size={20} color={colors.white} />
            <Text style={styles.addToCartText}>
              Add to Cart — ${(getItemPrice(selectedProduct, detailQty) * detailQty).toFixed(2)}
            </Text>
          </TouchableOpacity>

          {/* View Cart shortcut if items in cart */}
          {cartCount > 0 && (
            <TouchableOpacity
              style={styles.viewCartBtn}
              onPress={() => setScreen('cart')}
            >
              <Ionicons name="bag-outline" size={18} color={colors.navy} />
              <Text style={styles.viewCartBtnText}>
                View Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'}) — ${cartTotal.toFixed(2)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.navy} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  // ═══════════════════ CART SCREEN ═══════════════════
  const renderCart = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {cart.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setScreen('browse')}>
            <Text style={styles.emptyBtnText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {cart.map(item => (
            <View key={item.product.id} style={styles.cartItem}>
              {item.product.image_url ? (
                <Image source={{ uri: item.product.image_url }} style={styles.cartItemImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cartItemImage, styles.productImagePlaceholder]}>
                  <Ionicons name="shirt-outline" size={24} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.cartItemInfo}>
                <Text style={styles.cartItemName} numberOfLines={2}>{item.product.name}</Text>
                <Text style={styles.cartItemPrice}>${(getItemPrice(item.product, item.quantity) * item.quantity).toFixed(2)}</Text>
                {item.quantity >= TEAM_DISCOUNT_THRESHOLD && (
                  <Text style={styles.cartItemDiscount}>Team discount applied!</Text>
                )}
                <View style={styles.qtyRowSmall}>
                  <TouchableOpacity style={styles.qtyBtnSmall} onPress={() => updateQuantity(item.product.id, item.quantity - 1)}>
                    <Ionicons name="remove" size={16} color={colors.navy} />
                  </TouchableOpacity>
                  <Text style={styles.qtyTextSmall}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.qtyBtnSmall} onPress={() => updateQuantity(item.product.id, item.quantity + 1)}>
                    <Ionicons name="add" size={16} color={colors.navy} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeFromCart(item.product.id)} style={styles.cartRemove}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Order summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>${cartTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>FREE</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>${cartTotal.toFixed(2)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.checkoutBtn} onPress={() => setScreen('checkout')}>
            <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );

  // ═══════════════════ CHECKOUT SCREEN ═══════════════════
  const renderCheckout = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Shipping Address</Text>
      <View style={styles.formCard}>
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor={colors.textMuted}
          value={shipping.name}
          onChangeText={v => setShipping(s => ({ ...s, name: v }))}
          textContentType="name"
          autoComplete="name"
        />
        <TextInput
          style={styles.input}
          placeholder="Street Address"
          placeholderTextColor={colors.textMuted}
          value={shipping.address}
          onChangeText={v => setShipping(s => ({ ...s, address: v }))}
          textContentType="streetAddressLine1"
          autoComplete="street-address"
        />
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="City"
            placeholderTextColor={colors.textMuted}
            value={shipping.city}
            onChangeText={v => setShipping(s => ({ ...s, city: v }))}
            textContentType="addressCity"
            autoComplete="postal-address-locality"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="State"
            placeholderTextColor={colors.textMuted}
            value={shipping.state}
            onChangeText={v => setShipping(s => ({ ...s, state: v.toUpperCase() }))}
            maxLength={2}
            autoCapitalize="characters"
            textContentType="addressState"
            autoComplete="postal-address-region"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Zip"
            placeholderTextColor={colors.textMuted}
            value={shipping.zip}
            onChangeText={v => setShipping(s => ({ ...s, zip: v }))}
            keyboardType="number-pad"
            maxLength={5}
            textContentType="postalCode"
            autoComplete="postal-code"
          />
        </View>
      </View>

      {/* Order Summary */}
      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Order Summary</Text>
      <View style={styles.formCard}>
        {cart.map(item => (
          <View key={item.product.id} style={styles.checkoutItem}>
            <Text style={styles.checkoutItemName} numberOfLines={1}>{item.product.name}</Text>
            <Text style={styles.checkoutItemQty}>x{item.quantity}</Text>
            <Text style={styles.checkoutItemPrice}>${(getItemPrice(item.product, item.quantity) * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={[styles.summaryRow, styles.summaryTotal, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md }]}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>${cartTotal.toFixed(2)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.payBtn, processing && { opacity: 0.6 }]}
        onPress={handleCheckout}
        disabled={processing}
      >
        {processing ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Ionicons name="lock-closed" size={18} color={colors.white} />
            <Text style={styles.payBtnText}>Pay ${cartTotal.toFixed(2)}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  // ═══════════════════ ORDERS SCREEN ═══════════════════
  const statusColor = (s: string) => {
    switch (s) {
      case 'paid': return colors.info;
      case 'shipped': return '#7b1fa2';
      case 'delivered': return colors.success;
      case 'cancelled': return colors.error;
      default: return colors.warning;
    }
  };

  const renderOrders = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {ordersLoading ? (
        <ActivityIndicator size="large" color={colors.cyan} style={{ marginTop: 40 }} />
      ) : orders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>No orders yet</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setScreen('browse')}>
            <Text style={styles.emptyBtnText}>Start Shopping</Text>
          </TouchableOpacity>
        </View>
      ) : (
        orders.map((order: any) => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderDate}>{new Date(order.created_at).toLocaleDateString()}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(order.status) + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor(order.status) }]}>{order.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.orderTotal}>${Number(order.total).toFixed(2)}</Text>
            {order.items?.map((item: any, i: number) => (
              <Text key={i} style={styles.orderItemText}>{item.quantity}x {item.product_name || 'Item'}</Text>
            ))}
            {order.shipping_city && (
              <Text style={styles.orderShipping}>Ships to: {order.shipping_city}, {order.shipping_state} {order.shipping_zip}</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );

  // ═══════════════════ HEADER + NAVIGATION ═══════════════════
  const screenTitle = () => {
    switch (screen) {
      case 'detail': return selectedProduct?.name || 'Product';
      case 'cart': return 'Cart';
      case 'checkout': return 'Checkout';
      case 'orders': return 'My Orders';
      default: return 'Shop';
    }
  };

  const showBack = screen !== 'browse';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={screenTitle()}
        showBack={showBack}
        onBack={() => {
          if (screen === 'checkout') setScreen('cart');
          else if (screen === 'detail' || screen === 'cart' || screen === 'orders') setScreen('browse');
          else setScreen('browse');
        }}
        rightAction={(screen === 'browse' || screen === 'detail') ? (
          <TouchableOpacity style={styles.cartIconWrap} onPress={() => setScreen('cart')}>
            <Ionicons name="cart-outline" size={24} color={colors.white} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : undefined}
      />

      {screen === 'browse' && renderBrowse()}
      {screen === 'detail' && renderDetail()}
      {screen === 'cart' && renderCart()}
      {screen === 'checkout' && renderCheckout()}
      {screen === 'orders' && renderOrders()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // ── Hero — full-bleed like HomeScreen ──
  heroBanner: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    justifyContent: 'flex-end',
    minHeight: 200,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 30, 60, 0.55)',
  },
  heroCyanEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.cyan,
  },
  heroContent: { alignItems: 'flex-start', zIndex: 1, paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 26, color: colors.white, ...fonts.extrabold, letterSpacing: 1 },
  heroSubtitle: { fontSize: 14, color: colors.cyanLight, ...fonts.medium, marginTop: spacing.xs },
  heroDivider: {
    width: 50,
    height: 2,
    backgroundColor: colors.cyan,
    borderRadius: 1,
    marginVertical: spacing.sm,
  },
  heroTagline: { fontSize: 13, color: colors.cyan, ...fonts.bold, letterSpacing: 0.5, opacity: 0.9 },

  // ── Categories ──
  categoryScroll: { marginBottom: spacing.lg },
  categoryScrollContent: { gap: spacing.sm, paddingRight: spacing.lg },
  categoryPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  categoryPillText: { fontSize: 14, color: colors.textSecondary, ...fonts.semibold },
  categoryPillTextActive: { color: colors.white },

  // ── Orders Link ──
  ordersLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ordersLinkText: { flex: 1, fontSize: 15, color: colors.navy, ...fonts.semibold, marginLeft: spacing.sm },

  // ── Product Grid ──
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH,
    backgroundColor: '#f0f0f0',
  },
  productImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  productInfo: {
    padding: spacing.md,
  },
  productName: { fontSize: 14, color: colors.text, ...fonts.semibold, lineHeight: 19 },
  productEvent: { fontSize: 11, color: colors.textMuted, ...fonts.medium, marginTop: 2 },
  productBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  productPrice: { fontSize: 16, color: colors.navy, ...fonts.bold },
  categoryBadge: {
    backgroundColor: colors.highlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  categoryBadgeText: { fontSize: 10, color: colors.navy, ...fonts.bold, textTransform: 'uppercase' },

  // ── Empty State ──
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 17, color: colors.textSecondary, ...fonts.semibold, marginTop: spacing.lg },
  emptySubtext: { fontSize: 14, color: colors.textMuted, ...fonts.regular, marginTop: spacing.xs },
  emptyBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  emptyBtnText: { color: colors.white, fontSize: 15, ...fonts.bold },

  // ── Detail ──
  detailImage: { width: '100%', height: SCREEN_WIDTH - spacing.lg * 2, borderRadius: radii.lg, backgroundColor: '#f0f0f0' },
  thumbScroll: { marginTop: spacing.md },
  thumbImage: { width: 72, height: 72, borderRadius: radii.sm, backgroundColor: '#f0f0f0', borderWidth: 2, borderColor: 'transparent' },
  thumbImageActive: { borderColor: colors.cyan, borderWidth: 2 },
  detailInfo: { marginTop: spacing.lg },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailName: { fontSize: 22, color: colors.text, ...fonts.bold, flex: 1, marginRight: spacing.md },
  detailPrice: { fontSize: 24, color: colors.navy, ...fonts.extrabold },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.highlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  eventBadgeText: { fontSize: 13, color: colors.navy, ...fonts.semibold, marginLeft: spacing.xs },
  categoryBadgeLg: {
    backgroundColor: colors.highlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  categoryBadgeLgText: { fontSize: 12, color: colors.navy, ...fonts.bold, textTransform: 'uppercase' },
  detailDescription: { fontSize: 15, color: colors.textSecondary, ...fonts.regular, lineHeight: 22, marginTop: spacing.lg },
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    marginTop: spacing.xxl,
    gap: spacing.sm,
  },
  addToCartText: { fontSize: 17, color: colors.white, ...fonts.bold },
  qtySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtySectionLabel: { fontSize: 16, color: colors.text, ...fonts.semibold },
  qtySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  qtySelectorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtySelectorText: { fontSize: 20, color: colors.navy, ...fonts.extrabold, minWidth: 28, textAlign: 'center' },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.highlight,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cyan,
  },
  viewCartBtnText: { fontSize: 15, color: colors.navy, ...fonts.bold, flex: 1 },

  // ── Discount / Preset / Price Breakdown ──
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f9ed',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#b8e6cc',
  },
  discountBannerText: { fontSize: 14, color: colors.success, ...fonts.semibold, flex: 1 },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  presetBtn: {
    width: 48,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetBtnActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  presetBtnText: { fontSize: 15, color: colors.textSecondary, ...fonts.bold },
  presetBtnTextActive: { color: colors.white },
  priceBreakdown: {
    backgroundColor: '#f0f7ff',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: '#d0e4f7',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  priceRowLabel: { fontSize: 14, color: colors.textSecondary, ...fonts.regular },
  priceRowStrike: { fontSize: 14, color: colors.textMuted, ...fonts.regular, textDecorationLine: 'line-through' as const },
  priceRowValue: { fontSize: 14, color: colors.text, ...fonts.semibold },
  priceRowBold: { fontSize: 16, color: colors.navy, ...fonts.extrabold },

  // ── Cart ──
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cartItemImage: { width: 72, height: 72, borderRadius: radii.sm, backgroundColor: '#f0f0f0' },
  cartItemInfo: { flex: 1, marginLeft: spacing.md, justifyContent: 'center' },
  cartItemName: { fontSize: 15, color: colors.text, ...fonts.semibold },
  cartItemPrice: { fontSize: 16, color: colors.navy, ...fonts.bold, marginTop: 4 },
  cartItemDiscount: { fontSize: 12, color: colors.success, ...fonts.semibold, marginTop: 2 },
  qtyRowSmall: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  qtyBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextSmall: { fontSize: 15, color: colors.text, ...fonts.bold },
  cartRemove: { justifyContent: 'center', paddingLeft: spacing.md },

  // ── Summary ──
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { fontSize: 15, color: colors.textSecondary, ...fonts.regular },
  summaryValue: { fontSize: 15, color: colors.text, ...fonts.semibold },
  summaryTotal: { marginTop: spacing.sm, marginBottom: 0 },
  summaryTotalLabel: { fontSize: 17, color: colors.text, ...fonts.bold },
  summaryTotalValue: { fontSize: 17, color: colors.navy, ...fonts.extrabold },

  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  checkoutBtnText: { fontSize: 17, color: colors.white, ...fonts.bold },

  // ── Checkout ──
  sectionTitle: { fontSize: 18, color: colors.text, ...fonts.bold, marginBottom: spacing.md },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    ...fonts.regular,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  checkoutItem: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  checkoutItemName: { flex: 1, fontSize: 14, color: colors.text, ...fonts.regular },
  checkoutItemQty: { fontSize: 14, color: colors.textMuted, ...fonts.medium, marginHorizontal: spacing.sm },
  checkoutItemPrice: { fontSize: 14, color: colors.navy, ...fonts.bold },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  payBtnText: { fontSize: 17, color: colors.white, ...fonts.bold },

  // ── Cart icon ──
  cartIconWrap: { position: 'relative', padding: spacing.xs },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: colors.cyan,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { fontSize: 10, color: colors.navy, ...fonts.extrabold },

  // ── Orders ──
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDate: { fontSize: 14, color: colors.textMuted, ...fonts.medium },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radii.full },
  statusText: { fontSize: 11, ...fonts.bold },
  orderTotal: { fontSize: 20, color: colors.navy, ...fonts.extrabold, marginTop: spacing.sm },
  orderItemText: { fontSize: 14, color: colors.textSecondary, ...fonts.regular, marginTop: 4 },
  orderShipping: { fontSize: 12, color: colors.textMuted, ...fonts.regular, marginTop: spacing.sm },
});
