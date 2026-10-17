import React from "react";
import { useState, useEffect, useRef } from "react";

import "./index.css";
import "./storefront-polish.css";
import { API_BASE_URL } from "./api.js";



const categories = ["All", "Mains", "Sides", "Desserts", "Fresh"];



function ArrowUpRight() {

  return (

    <svg viewBox="0 0 24 24" aria-hidden="true">

      <path d="M7 17 17 7M8 7h9v9" />

    </svg>

  );

}



function BagIcon() {

  return (

    <svg

      viewBox="0 0 24 24"

      fill="none"

      stroke="currentColor"

      strokeWidth="1.7"

      strokeLinecap="round"

      strokeLinejoin="round"

      aria-hidden="true"

    >

      <path d="M5 8h14l-1 12H6L5 8Z" />

      <path d="M9 9V6a3 3 0 0 1 6 0v3" />

      <path d="M9 13h6" />

    </svg>

  );

}

function offerBadge(offer) {
  if (!offer) return "";
  if (offer.type === "bogo") return "BUY 1 GET 1 FREE";
  if (offer.type === "percent") return `${Number(offer.value)}% OFF`;
  return `₹${Number(offer.value).toFixed(2)} OFF`;
}

function offerSavingsCents(dish, quantity) {
  const priceCents = Math.round(Number(dish.price) * 100);
  const offer = dish.offer;
  if (!offer || quantity <= 0) return 0;
  if (offer.type === "bogo") return priceCents * Math.floor(quantity / 2);
  if (offer.type === "percent") {
    return Math.min(priceCents, Math.round(priceCents * Number(offer.value) / 100)) * quantity;
  }
  if (offer.type === "fixed") {
    return Math.min(priceCents, Math.round(Number(offer.value) * 100)) * quantity;
  }
  return 0;
}

function offerUnitPriceCents(dish) {
  const priceCents = Math.round(Number(dish.price) * 100);
  if (dish.offer?.type === "percent") {
    return priceCents - Math.min(priceCents, Math.round(priceCents * Number(dish.offer.value) / 100));
  }
  if (dish.offer?.type === "fixed") {
    return priceCents - Math.min(priceCents, Math.round(Number(dish.offer.value) * 100));
  }
  return priceCents;
}

function DishMediaGallery({ dish, className = "" }) {
  const media = [
    ...(dish.image ? [{ id: "cover", type: "image", path: dish.image }] : []),
    ...(dish.gallery || []),
  ];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [dish.id]);

  if (!media.length) {
    return <div className={`dish-media-gallery dish-media-gallery--empty ${className}`} aria-label={`No photos for ${dish.name}`} />;
  }

  const currentIndex = Math.min(activeIndex, media.length - 1);
  const currentMedia = media[currentIndex];
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  const src = /^https?:\/\//i.test(currentMedia.path)
    ? currentMedia.path
    : new URL(currentMedia.path, `${apiOrigin}/`).href;

  return (
    <div className={`dish-media-gallery ${className}`}>
      {currentMedia.type === "video" ? (
        <video className="dish-media-gallery__asset" src={src} controls playsInline preload="metadata"
          aria-label={`${dish.name} video`} />
      ) : (
        <img className={`dish-media-gallery__asset${className.includes("food-card") ? " food-card__image" : ""}`}
          src={src} alt={dish.name} loading="lazy" />
      )}
      {media.length > 1 && (
        <div className="dish-media-gallery__controls" aria-label={`${dish.name} gallery`}>
          <button type="button" aria-label="Previous gallery item"
            onClick={() => setActiveIndex((currentIndex + media.length - 1) % media.length)}>‹</button>
          <span>{currentIndex + 1}/{media.length}</span>
          <button type="button" aria-label="Next gallery item"
            onClick={() => setActiveIndex((currentIndex + 1) % media.length)}>›</button>
        </div>
      )}
    </div>
  );
}

function RecommendationsSection({ dishes, onAdd, loading, error }) {
  if (loading || error || dishes.length === 0) return null;
  return (
    <section className="menu-recommendations" aria-labelledby="menu-recommendations-title">
      <div className="menu-recommendations__heading">
        <div>
          <span className="eyebrow-line" />
          RESTAURANT FAVOURITES
          <h3 id="menu-recommendations-title">Our best picks, <em>made for you.</em></h3>
        </div>
        <p>Discover the dishes our restaurant recommends. Look for a special offer and add a favourite straight to your bag.</p>
      </div>
      <div className="menu-recommendations__grid">
        {dishes.map((dish) => {
          const isBogo = dish.offer?.type === "bogo";
          const discountPrice = offerUnitPriceCents(dish) / 100;
          const actionLabel = isBogo ? `Add pair · ₹${Number(dish.price).toFixed(2)}` : `Add to bag · ₹${discountPrice.toFixed(2)}`;
          return (
            <article className="recommendation-card" key={dish.id}>
              <DishMediaGallery dish={dish} className="recommendation-card__media" />
              <div className="recommendation-card__content">
                <span>{dish.offer ? offerBadge(dish.offer) : (dish.tag || "RESTAURANT FAVOURITE")}</span>
                <h4>{dish.name}</h4>
                <p>{dish.offer?.description || (isBogo ? `₹${Number(dish.price).toFixed(2)} for two when you add a pair` : "One of our restaurant's recommended dishes.")}</p>
                <button type="button" onClick={() => onAdd(dish, isBogo ? 2 : 1)}>{actionLabel}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}


function FoodCard({ dish, onAdd, wishlisted, wishlistLists, wishlistOpen, onToggleWishlistPicker, onSelectWishlist }) {
  const priceCents = offerUnitPriceCents(dish);
  const displayPrice = priceCents / 100;
  const comparedPrice = Number(dish.oldPrice);
  const discount = Math.round(((comparedPrice - displayPrice) / comparedPrice) * 100);



  return (

    <article className="food-card">

      <div className="food-card__image-wrap">
        <DishMediaGallery dish={dish} className="food-card__image-frame" />

        <span className="food-tag">{dish.tag}</span>
        {dish.offer && <span className="food-offer-badge">{offerBadge(dish.offer)}</span>}

        <button
          className={`wishlist-button${wishlisted ? " is-saved" : ""}`}
          type="button"
          onClick={() => onToggleWishlistPicker(dish)}
          aria-label={`Choose a wishlist section for ${dish.name}`}
          aria-expanded={wishlistOpen}
          aria-controls={`wishlist-picker-${dish.id}`}
        >
          {wishlisted ? "♥" : "♡"}
        </button>

        {wishlistOpen && (
          <div className="wishlist-picker" id={`wishlist-picker-${dish.id}`} role="group" aria-label={`Choose a wishlist section for ${dish.name}`}>
            <strong>Save to a section</strong>
            {wishlistLists.length === 0 ? (
              <p>No wishlist sections yet. Create one in your account.</p>
            ) : wishlistLists.map((list) => {
              const saved = list.dishes.some((item) => item.id === dish.id);
              return (
                <button
                  className="wishlist-picker__option"
                  type="button"
                  key={list.id}
                  onClick={() => onSelectWishlist(dish, list, saved)}
                >
                  <span>{list.name}</span>
                  <span>{saved ? "♥ Saved" : "＋ Save"}</span>
                </button>
              );
            })}
            <a href="/account">Manage sections ↗</a>
          </div>
        )}

        <button

          className="add-button"

          type="button"

          onClick={() => onAdd(dish)}

          aria-label={`Add ${dish.name}`}

        >

          +

        </button>

      </div>



      <div className="food-card__body">

        <div className="food-card__meta">

          <span>{dish.category}</span>

          <span className="dot" />

          <span>{dish.time}</span>

        </div>



        <div className="food-card__title-row">

          <h3>{dish.name}</h3>

        </div>



        <div className="food-price-row">

          <strong className="sale-price">₹{displayPrice.toFixed(2)}</strong>
          <span className="old-price">₹{comparedPrice.toFixed(2)}</span>
          {discount > 0 && <span className="discount-badge">{discount}% OFF</span>}

        </div>



        <p>{dish.description}</p>

      </div>

    </article>

  );
}

function loadSavedCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("foodieexpress-cart") || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(([id, quantity]) =>
        Number.isInteger(Number(id)) && Number(id) > 0 &&
        Number.isInteger(quantity) && quantity > 0 && quantity <= 99,
      ),
    );
  } catch (error) {
    console.error("Saved cart could not be loaded:", error);
    return {};
  }
}

function loadSavedBundleCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("foodieexpress-bundle-cart") || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(([id, quantity]) =>
        Number.isInteger(Number(id)) && Number(id) > 0 &&
        Number.isInteger(quantity) && quantity > 0 && quantity <= 99,
      ),
    );
  } catch (error) {
    console.error("Saved bundle cart could not be loaded:", error);
    return {};
  }
}

function BundlesSection({ bundles, onAdd }) {
  if (!bundles.length) return null;
  return (
    <section className="menu-recommendations menu-bundles" aria-labelledby="menu-bundles-title">
      <div className="menu-recommendations__heading">
        <div>
          <span className="eyebrow-line" />
          MADE-TO-ORDER COMBOS
          <h3 id="menu-bundles-title">Bundle a little <em>happiness.</em></h3>
        </div>
        <p>Hand-picked combinations, assembled by our team and priced as one bundle.</p>
      </div>
      <div className="menu-recommendations__grid">
        {bundles.map((bundle) => (
          <article className="recommendation-card" key={bundle.id}>
            <img src={bundle.image || undefined} alt={bundle.title} loading="lazy" />
            <div className="recommendation-card__content">
              <span>BUNDLE · SAVE ₹{(bundle.regularPrice - bundle.price).toFixed(2)}</span>
              <h4>{bundle.title}</h4>
              <p>{bundle.description || bundle.items.map((item) => `${item.name} × ${item.quantity}`).join(" · ")}</p>
              <button type="button" onClick={() => onAdd(bundle)}>
                Add bundle · ₹{Number(bundle.price).toFixed(2)}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const storefrontNavigation = [
  ["home", "Home", "/"],
  ["menu", "Our menu", "/menu"],
  ["story", "Our story", "/story"],
  ["reviews", "Kind words", "/reviews"],
  ["contact", "Contact", "/contact"],
];

const pageTopLinks = {
  home: "/#home",
  menu: "/menu#menu",
  story: "/story#story",
  reviews: "/reviews#reviews",
  contact: "/contact#contact",
};

export default function App({ page = "home" }) {
  const [user, setUser] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryPostalCode, setDeliveryPostalCode] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [wishlistIds, setWishlistIds] = useState([]);
  const [wishlistLists, setWishlistLists] = useState([]);
  const [activeWishlistDishId, setActiveWishlistDishId] = useState(null);
  const [savedAddresses, setSavedAddresses] = useState([]);

  const [cart, setCart] = useState(loadSavedCart);
  const [bundleCart, setBundleCart] = useState(loadSavedBundleCart);

  const [cartOpen, setCartOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const toastTimeout = useRef(null);

  const [email, setEmail] = useState("");

  const [subscribed, setSubscribed] = useState(false);

  function notify(message, isError = false, duration = 2200) {
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    setToastError(isError);
    setToast(message);
    toastTimeout.current = window.setTimeout(() => {
      setToast("");
      toastTimeout.current = null;
    }, duration);
  }

  useEffect(() => () => {
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not check your account.");
        return response.json();
      })
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch((error) => console.error("Account status could not be loaded:", error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (user) {
      if (!customerName) setCustomerName(user.name);
      if (!customerPhone) setCustomerPhone(user.phone || "");
    }
  }, [user, customerName, customerPhone]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setSavedAddresses([]);
      return () => { active = false; };
    }
    fetch(`${API_BASE_URL}/account/addresses`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load saved addresses.");
        return response.json();
      })
      .then((addresses) => {
        if (!active) return;
        setSavedAddresses(addresses);
        const defaultAddress = addresses.find((address) => address.isDefault);
        if (defaultAddress) {
          setCustomerName((current) => current || defaultAddress.recipient);
          setCustomerPhone((current) => current || defaultAddress.phone);
          setCustomerAddress((current) => current || [
            defaultAddress.line1,
            defaultAddress.line2,
            defaultAddress.city,
            defaultAddress.state,
            defaultAddress.postalCode,
          ].filter(Boolean).join(", "));
          setDeliveryCity((current) => current || defaultAddress.city);
          setDeliveryState((current) => current || defaultAddress.state);
          setDeliveryPostalCode((current) => current || defaultAddress.postalCode);
        }
      })
      .catch((error) => console.error("Saved addresses could not be loaded:", error));
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setWishlistIds([]);
      setWishlistLists([]);
      return () => { active = false; };
    }
    fetch(`${API_BASE_URL}/account/wishlist/lists`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your wishlist.");
        return response.json();
      })
      .then((lists) => {
        if (active) {
          setWishlistLists(lists);
          setWishlistIds([...new Set(lists.flatMap((list) => list.dishes.map((item) => item.id)))]);
        }
      })
      .catch((error) => console.error("Wishlist could not be loaded:", error));
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    function profileUpdated(event) {
      setUser(event.detail);
      setCustomerName(event.detail.name);
      setCustomerPhone(event.detail.phone || "");
    }
    function wishlistUpdated(event) {
      if (Array.isArray(event.detail.dishIds)) {
        const affected = new Set(event.detail.dishIds);
        const stillSaved = new Set(event.detail.savedDishIds);
        setWishlistIds((current) => [
          ...current.filter((id) => !affected.has(id) || stillSaved.has(id)),
          ...event.detail.savedDishIds.filter((id) => !current.includes(id)),
        ]);
        return;
      }
      setWishlistIds((current) => event.detail.saved
        ? [...new Set([...current, event.detail.dishId])]
        : current.filter((id) => id !== event.detail.dishId));
    }
    window.addEventListener("foodieexpress:profile-updated", profileUpdated);
    window.addEventListener("foodieexpress:wishlist-updated", wishlistUpdated);
    return () => {
      window.removeEventListener("foodieexpress:profile-updated", profileUpdated);
      window.removeEventListener("foodieexpress:wishlist-updated", wishlistUpdated);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("foodieexpress-cart", JSON.stringify(cart));
      window.localStorage.setItem("foodieexpress-bundle-cart", JSON.stringify(bundleCart));
    } catch (error) {
      console.error("Cart could not be saved:", error);
    }
  }, [cart,bundleCart]);



  useEffect(() => {
    let active = true;

    async function loadDishes() {
      try {
        const [menuResponse, bundlesResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/foods`),
          fetch(`${API_BASE_URL}/bundles`),
        ]);
        if (!menuResponse.ok || !bundlesResponse.ok) throw new Error("Unable to load the menu and bundles.");
        const [menuData, bundleData] = await Promise.all([menuResponse.json(), bundlesResponse.json()]);
        if (active) {
          setDishes(menuData);
          setBundles(bundleData);
        }
      } catch (error) {
        console.error("Menu loading failed:", error);
        if (active) setMenuError("Unable to load the menu and bundles. Please check that the backend is running.");
      } finally {
        if (active) setMenuLoading(false);
      }
    }

    loadDishes();
    return () => { active = false; };
  }, []);

  const cartCount = Object.values(cart).reduce(

    (sum, quantity) => sum + quantity,

    0
  ) + Object.values(bundleCart).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );



  const cartItems = dishes.filter((dish) => cart[dish.id] > 0);
  const bundleCartItems = bundles.filter((bundle) => bundleCart[bundle.id] > 0);
  const offerSavings = cartItems.reduce(
    (sum, dish) => sum + offerSavingsCents(dish, cart[dish.id]),
    0,
  );

  const cartListTotalCents = cartItems.reduce(
    (sum, dish) => sum + Math.round(Number(dish.price) * 100) * cart[dish.id],
    0,
  );
  const bundleSubtotalCents = bundleCartItems.reduce(
    (sum, bundle) => sum + Math.round(Number(bundle.price) * 100) * bundleCart[bundle.id],
    0,
  );
  const bundleOriginalTotalCents = bundleCartItems.reduce(
    (sum, bundle) => sum + Math.round(Number(bundle.originalPrice) * 100) * bundleCart[bundle.id],
    0,
  );
  const cartTotalCents = cartListTotalCents - offerSavings + bundleSubtotalCents;
  const originalTotalCents = cartItems.reduce(
    (sum, dish) => sum + Math.round(Number(dish.oldPrice) * 100) * cart[dish.id],
    0,
  ) + bundleOriginalTotalCents;
  const cartTotal = cartTotalCents / 100;
  const originalTotal = originalTotalCents / 100;
  const itemDiscount = (originalTotalCents - cartTotalCents) / 100;



  // Extra 10% discount applies when the discounted subtotal is above ₹500.

  const extraDiscount =
    cartTotalCents > 50000 ? Math.round(cartTotalCents * 0.001) : 0;



  const finalTotal = cartTotal - extraDiscount;



  const filteredDishes =

    activeCategory === "All"

      ? dishes
      : dishes.filter((dish) => dish.category === activeCategory);

  const recommendedDishes = dishes.filter((dish) => dish.isRecommended);

  function changeQuantity(dish, amount) {
    if (amount > 0 && (cart[dish.id] || 0) + amount > 99) {
      notify("Maximum quantity per dish is 99.", true);
      return;
    }
    setCart((current) => {

      const nextQuantity = (current[dish.id] || 0) + amount;

      const next = { ...current };



      if (nextQuantity <= 0) {

        delete next[dish.id];

      } else {

        next[dish.id] = nextQuantity;

      }



      return next;

    });

    if (amount > 0) {
      notify(`${dish.name} added to your bag`);
    }

  }



  function addToBag(dish) {

    changeQuantity(dish, 1);

  }

  function addRecommendedDish(dish, quantity = 1) {
    changeQuantity(dish, quantity);
  }

  function changeBundleQuantity(bundle, amount) {
    setBundleCart((current) => {
      const nextQuantity = (current[bundle.id] || 0) + amount;
      if (nextQuantity > 99) {
        notify("Maximum quantity per bundle is 99.", true);
        return current;
      }
      const next = { ...current };
      if (nextQuantity <= 0) delete next[bundle.id];
      else next[bundle.id] = nextQuantity;
      return next;
    });
    if (amount > 0) notify(`${bundle.title} added to your bag`);
  }

  async function toggleWishlistPicker(dish) {
    if (!user) {
      window.location.assign("/login?next=wishlist");
      return;
    }
    const nextDishId = activeWishlistDishId === dish.id ? null : dish.id;
    setActiveWishlistDishId(nextDishId);
    if (nextDishId !== null) {
      try {
        const response = await fetch(`${API_BASE_URL}/account/wishlist/lists`, { credentials: "include" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load your wishlist sections.");
        setWishlistLists(data);
        setWishlistIds([...new Set(data.flatMap((list) => list.dishes.map((item) => item.id)))]);
      } catch (error) {
        setActiveWishlistDishId(null);
        notify(error.message || "Could not load your wishlist sections.", true, 4000);
      }
    }
  }

  async function chooseWishlistSection(dish, list, isSaved) {
    try {
      const response = await fetch(`${API_BASE_URL}/account/wishlist/${dish.id}${isSaved ? `?listId=${list.id}` : ""}`, {
        method: isSaved ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: isSaved ? undefined : JSON.stringify({ listId: list.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update your wishlist.");
      setWishlistLists((current) => current.map((item) => item.id === list.id
        ? { ...item, dishes: isSaved
          ? item.dishes.filter((savedDish) => savedDish.id !== dish.id)
          : [...item.dishes, dish] }
        : item));
      const stillSaved = isSaved && wishlistLists.some((item) => item.id !== list.id
        && item.dishes.some((savedDish) => savedDish.id === dish.id));
      if (isSaved && !stillSaved) setWishlistIds((current) => current.filter((id) => id !== dish.id));
      if (!isSaved) setWishlistIds((current) => [...new Set([...current, dish.id])]);
      setActiveWishlistDishId(null);
      notify(isSaved ? `${dish.name} removed from ${list.name}` : `${dish.name} saved to ${list.name}`);
      window.dispatchEvent(new CustomEvent("foodieexpress:wishlist-updated", {
        detail: { dishId: dish.id, saved: isSaved ? Boolean(stillSaved) : true },
      }));
    } catch (error) {
      notify(error.message || "Could not update your wishlist.", true, 4000);
    }
  }



  function handleSubscribe(event) {

    event.preventDefault();



    if (!email.trim()) return;



    setSubscribed(true);

    setEmail("");

  }

  async function signOut() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setUser(null);
      notify("You have been signed out.");
    } catch (error) {
      notify(error.message || "Could not sign out. Please try again.", true, 4000);
    }
  }




  async function handleCheckout(event) {
    event.preventDefault();
    if ((cartItems.length === 0 && bundleCartItems.length === 0) || orderSubmitting) return;
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim() ||
        !deliveryCity.trim() || !deliveryState.trim() || !deliveryPostalCode.trim()) {
      notify("Please fill in all delivery details.", true, 4000);
      return;
    }
    if (!/^[+()\d\s-]{7,20}$/.test(customerPhone.trim())) {
      notify("Enter a valid phone number.", true, 4000);
      return;
    }

    setOrderSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: customerPhone.trim(),
          address: customerAddress.trim(),
          deliveryLocation: {
            city: deliveryCity.trim(),
            state: deliveryState.trim(),
            postalCode: deliveryPostalCode.trim(),
          },
          items: cartItems.map((dish) => ({
            id: dish.id,
            quantity: cart[dish.id],
          })),
          bundles: bundleCartItems.map((bundle) => ({
            id: bundle.id,
            quantity: bundleCart[bundle.id],
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not place order (HTTP ${response.status}).`);

      setCart({});
      setBundleCart({});
      setCartOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setDeliveryCity("");
      setDeliveryState("");
      setDeliveryPostalCode("");
      notify(`Order #${data.orderId} saved successfully!`, false, 4000);
    } catch (error) {
      console.error("Checkout failed:", error);
      notify(error.message || "Checkout failed. Please try again.", true, 4000);
    } finally {
      setOrderSubmitting(false);
    }
  }

  function browseMenu() {
    setCartOpen(false);
    if (page !== "menu") window.location.assign("/menu");
    else document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  }



  return (

    <div className="site-shell">

      <div className="announcement">

        <span className="announcement__spark">✳</span>

        <span>

          Good food, good mood.{" "}

          <strong>Free delivery on your first order over ₹499.</strong>

        </span>

        <a href="/menu">

          Explore the menu <span>↗</span>

        </a>

      </div>



      <header className="site-header">

        <a className="brand" href="/" aria-label="FoodieExpress home">

          <span className="brand__mark">

            f<span>.</span>

          </span>

          <span className="brand__word">

            foodie<span>express</span>

          </span>

        </a>



        <nav className={`main-nav${mobileNavOpen ? " is-open" : ""}`} aria-label="Main navigation">

          {storefrontNavigation.map(([id, label, href]) => (
            <a key={id} className={page === id ? "active" : ""} href={href} aria-current={page === id ? "page" : undefined}>
              {label}
            </a>
          ))}

        </nav>



        <div className="header-actions">
          {user ? (
            <>
              <a className="account-greeting" href="/account" aria-label={`Open My account for ${user.name}`} title="Open My account">
                <span>Hi, {user.name}</span><span className="account-greeting__arrow" aria-hidden="true">↗</span>
              </a>
              <a className="header-account header-account--mobile" href="/account" aria-label="Open My account">My account ↗</a>
              <button className="account-signout" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <a className="header-account" href="/login">Sign in</a>
          )}

          <a className="header-order" href="/menu">

            Order something good <ArrowUpRight />

          </a>



          <button

            className="bag-button"

            type="button"

            onClick={() => setCartOpen(true)}

            aria-label={`Open bag with ${cartCount} items`}

          >

            <BagIcon />

            <span className="bag-count">{cartCount}</span>

          </button>



          <button

            className="mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
          >

            <span />

            <span />

          </button>

        </div>

      </header>



      <main>

        {page === "home" && <>
        <section className="hero section-pad" id="home">

          <div className="hero-copy">

            <div className="eyebrow">

              <span className="eyebrow-line" />

              MADE WITH A LITTLE MORE LOVE

            </div>



            <h1>

              Good food.

              <br />

              <em>Better days.</em>

            </h1>



            <p className="hero-description">

              Your cravings called. We answered with fresh ingredients, big

              flavours and the kind of food that makes an ordinary day feel

              special.

            </p>



            <div className="hero-actions">

              <a className="button button--dark" href="/menu">

                Explore the menu <ArrowUpRight />

              </a>

              <a className="text-link" href="/story">

                Get to know us <span>↗</span>

              </a>

            </div>



            <div className="hero-proof">

              <div className="avatar-stack">

                <img

                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"

                  alt=""

                />

                <img

                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80"

                  alt=""

                />

                <img

                  src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=80"

                  alt=""

                />

              </div>



              <div>

                <div className="rating-line">

                  <span className="rating-stars">★★★★★</span>

                  <strong>4.9/5</strong>

                </div>

                <span className="proof-caption">

                  Loved by food people everywhere

                </span>

              </div>

            </div>



            <span className="hero-doodle" aria-hidden="true">↘</span>

          </div>



          <div className="hero-visual">

            <div className="hero-image-main">

              <img

                src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1400&q=90"

                alt="A colourful, freshly prepared meal on a table"

              />

            </div>



            <div className="hero-sticker">

              <span>FRESH</span>

              <strong>food,</strong>

              <em>happy</em>

              <span>YOU.</span>

              <i>✳</i>

            </div>



            <div className="hero-note">

              <span className="hero-note__icon">✳</span>

              <div>

                <strong>Made fresh.</strong>

                <span>Never just reheated.</span>

              </div>

            </div>



            <div className="hero-image-small">

              <img

                src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=85"

                alt="Freshly baked pizza"

              />

            </div>

          </div>



          <div className="hero-bottom-note">

            <span>01 / 04</span>

            <span className="hero-bottom-rule" />

            <span>THE GOOD STUFF STARTS HERE</span>

          </div>

        </section>

        <div className="section-pad">
          <RecommendationsSection
            dishes={recommendedDishes}
            onAdd={addRecommendedDish}
            loading={menuLoading}
            error={menuError}
          />
          <BundlesSection bundles={bundles} onAdd={(bundle) => changeBundleQuantity(bundle, 1)} />
        </div>

        <section className="benefits-strip" aria-label="What makes us different">

          <div>

            <span className="benefit-icon">✳</span>

            <strong>Fresh, always</strong>

            <span>Good ingredients. No shortcuts.</span>

          </div>

          <div>

            <span className="benefit-icon">♡</span>

            <strong>Made with care</strong>

            <span>Every dish has a little heart.</span>

          </div>

          <div>

            <span className="benefit-icon">↗</span>

            <strong>At your doorstep</strong>

            <span>Great food, right on time.</span>

          </div>

          <div>

            <span className="benefit-icon">✦</span>

            <strong>Worth sharing</strong>

            <span>For your people and your palate.</span>

          </div>

        </section>
        </>}

        {page === "menu" && <section className="menu-section section-pad" id="menu">

          <div className="section-heading">

            <div>

              <div className="eyebrow">

                <span className="eyebrow-line" />

                A LITTLE SOMETHING FOR EVERYONE

              </div>

              <h2>

                Cravings, <em>meet</em> menu.

              </h2>

            </div>

            <p>

              From your all-time favourites to your new “where has this been

              all my life?” — there’s a plate with your name on it.

            </p>

          </div>



          <RecommendationsSection
            dishes={recommendedDishes}
            onAdd={addRecommendedDish}
            loading={menuLoading}
            error={menuError}
          />
          <BundlesSection bundles={bundles} onAdd={(bundle) => changeBundleQuantity(bundle, 1)} />

          <div className="menu-toolbar">

            <div className="category-tabs" role="group" aria-label="Filter menu by category">

              {categories.map((category) => (

                <button

                  key={category}

                  type="button"

                  className={

                    activeCategory === category

                      ? "category-tab active"

                      : "category-tab"

                  }

                  onClick={() => setActiveCategory(category)}

                >

                  {category}

                </button>

              ))}

            </div>



            <span className="menu-count">

              Showing{" "}

              <strong>

                {filteredDishes.length.toString().padStart(2, "0")}

              </strong>{" "}

              delicious things

            </span>

          </div>



          <div className="food-grid">
            {menuLoading ? (
              <p>Loading our delicious menu...</p>
            ) : menuError ? (
              <p>{menuError}</p>
            ) : filteredDishes.length === 0 ? (
              <p>No dishes available in this category.</p>
            ) : (
              filteredDishes.map((dish) => (
                <FoodCard
                  key={dish.id}
                  dish={dish}
                  onAdd={addToBag}
                  wishlisted={wishlistIds.includes(dish.id)}
                  wishlistLists={wishlistLists}
                  wishlistOpen={activeWishlistDishId === dish.id}
                  onToggleWishlistPicker={toggleWishlistPicker}
                  onSelectWishlist={chooseWishlistSection}
                />
              ))
            )}
          </div>

          <div className="menu-bottom">

            <span>GOOD THINGS TAKE A LITTLE PREP.</span>

            <span>

              Made fresh when you order <span className="orange">✳</span>

            </span>

          </div>

        </section>}



        {page === "story" && <>
        <section className="feature-section section-pad">

          <div className="feature-photo">

            <img

              src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1300&q=90"

              alt="A table full of delicious food made for sharing"

              loading="lazy"

            />

            <div className="feature-photo-label">

              <span>THE SECRET INGREDIENT?</span>

              <strong>It's always care.</strong>

            </div>

          </div>



          <div className="feature-copy">

            <div className="eyebrow">

              <span className="eyebrow-line" />

              NOT JUST ANOTHER MEAL

            </div>

            <h2>

              Food should

              <br />

              feel like a <em>hug.</em>

            </h2>

            <p>

              We believe the best meals do more than fill you up. They bring

              people together, turn small moments into memories and make you

              close your eyes after the first bite.

            </p>

            <p>

              That’s why we keep things fresh, flavourful and full of the

              little details that make a big difference.

            </p>

            <a className="button button--outline" href="/story">

              A little about us <ArrowUpRight />

            </a>

            <div className="handwritten">

              Made with love <span>♡</span>

            </div>

          </div>

        </section>



        <section className="story-section section-pad" id="story">

          <div className="story-top">

            <div className="eyebrow">

              <span className="eyebrow-line" />

              OUR LITTLE FOOD PHILOSOPHY

            </div>

            <h2>

              Simple ingredients.

              <br />

              <em>Unforgettable</em> moments.

            </h2>

          </div>



          <div className="story-content">

            <div className="story-intro">

              <span className="story-number">01</span>

              <h3>

                We care about

                <br />

                what goes on

                <br />

                your plate.

              </h3>

            </div>



            <div className="story-text">

              <p>

                FoodieExpress started with one simple thought: everyday food

                deserves to be extraordinary. Not complicated. Not fussy. Just

                honest ingredients, thoughtful cooking and flavours that make

                you come back for one more bite.

              </p>

              <p>

                We’re here for your Tuesday lunch, your Friday treat, your

                family dinner and all the little moments in between. Pull up a

                chair — there’s always room for one more.

              </p>

              <a className="text-link" href="/contact">

                Say hello <span>↗</span>

              </a>

            </div>



            <div className="story-stamp">

              <span>GOOD FOOD</span>

              <strong>

                GOOD

                <br />

                MOOD

              </strong>

              <span>THAT'S THE WAY ✳</span>

            </div>

          </div>



          <div className="values-row">

            <div>

              <span>01</span>

              <strong>Honest ingredients</strong>

              <p>Fresh produce and ingredients we’re proud to use.</p>

            </div>

            <div>

              <span>02</span>

              <strong>Flavour first</strong>

              <p>Big, balanced flavour in every single bite.</p>

            </div>

            <div>

              <span>03</span>

              <strong>Made for sharing</strong>

              <p>Food tastes better when there’s enough to go around.</p>

            </div>

          </div>

        </section>



        <section className="quote-banner">

          <div className="quote-banner__mark">“</div>

          <p>

            Happiness is homemade.

            <br />

            <em>And sometimes delivered.</em>

          </p>

          <span>— THE FOODIEEXPRESS WAY</span>

          <div className="quote-banner__spark">✳</div>

        </section>
        </>}



        {page === "reviews" && <>
        <section className="reviews-section section-pad" id="reviews">

          <div className="section-heading reviews-heading">

            <div>

              <div className="eyebrow">

                <span className="eyebrow-line" />

                DON'T JUST TAKE OUR WORD FOR IT

              </div>

              <h2>

                Kind words.

                <br />

                <em>Full hearts.</em>

              </h2>

            </div>



            <div className="reviews-score">

              <span className="rating-stars">★★★★★</span>

              <strong>

                4.9 <small>/ 5</small>

              </strong>

              <span>Based on happy taste buds</span>

            </div>

          </div>



          <div className="review-grid">

            <article className="review-card">

              <div className="review-stars">★★★★★</div>

              <p>

                “The biryani was genuinely incredible. Perfectly spiced, fresh

                and the portion was generous. This is officially my Friday

                ritual.”

              </p>

              <div className="review-person">

                <img

                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"

                  alt="Portrait of customer Ananya"

                />

                <div>

                  <strong>Ananya R.</strong>

                  <span>Foodie since day one</span>

                </div>

                <span className="review-quote">“</span>

              </div>

            </article>



            <article className="review-card review-card--featured">

              <div className="review-stars">★★★★★</div>

              <p>

                “Finally, food that looks as good as it tastes. The little

                details, the packaging, the flavour — you can tell someone

                really cares.”

              </p>

              <div className="review-person">

                <img

                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"

                  alt="Portrait of customer Rohan"

                />

                <div>

                  <strong>Rohan M.</strong>

                  <span>Regular & proud</span>

                </div>

                <span className="review-quote">“</span>

              </div>

            </article>



            <article className="review-card">

              <div className="review-stars">★★★★★</div>

              <p>

                “Ordered for friends and ended up being the person everyone

                asked about the food. Safe to say, I took all the credit.”

              </p>

              <div className="review-person">

                <img

                  src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=120&q=80"

                  alt="Portrait of customer Meera"

                />

                <div>

                  <strong>Meera S.</strong>

                  <span>Unofficial ambassador</span>

                </div>

                <span className="review-quote">“</span>

              </div>

            </article>

          </div>



          <p className="review-disclaimer">

            Sample testimonials shown for website presentation. Replace with

            verified customer reviews before publishing.

          </p>

        </section>



        <section className="newsletter-section section-pad">

          <div className="newsletter-spark">✳</div>

          <div>

            <div className="eyebrow">

              <span className="eyebrow-line" />

              GOOD THINGS IN YOUR INBOX

            </div>

            <h2>

              A little <em>food</em> for thought.

            </h2>

            <p>

              New dishes, little surprises and the occasional excuse to treat

              yourself.

            </p>

          </div>



          <form className="newsletter-form" onSubmit={handleSubscribe}>

            {subscribed ? (

              <div className="subscribe-success">

                You're on the list. Good things ahead! ✳

              </div>

            ) : (

              <>

                <label className="sr-only" htmlFor="newsletter-email">

                  Email address

                </label>

                <input

                  id="newsletter-email"

                  type="email"

                  placeholder="Your email address"

                  value={email}

                  onChange={(event) => setEmail(event.target.value)}

                  required

                />

                <button type="submit" aria-label="Subscribe">

                  Join us <ArrowUpRight />

                </button>

              </>

            )}

            <span className="newsletter-note">

              Just the good stuff. No spam, ever.

            </span>

          </form>

        </section>
        </>}



        {page === "contact" && <section className="contact-section section-pad" id="contact">

          <div className="contact-copy">

            <div className="eyebrow">

              <span className="eyebrow-line" />

              COME SAY HELLO

            </div>

            <h2>

              Good food is

              <br />

              better <em>together.</em>

            </h2>

            <p>

              Questions, compliments, a very important food opinion? We’re all

              ears.

            </p>

            <a

              className="button button--dark"

              href="mailto:hello@foodieexpress.example"

            >

              hello@foodieexpress.example <ArrowUpRight />

            </a>

          </div>



          <div className="contact-details">

            <div>

              <span>FIND US</span>

              <strong>Hyderabad, India</strong>

              <p>Serving good moods across the city.</p>

            </div>

            <div>

              <span>WHEN WE'RE HERE</span>

              <strong>Every day, 11 AM – 11 PM</strong>

              <p>Because cravings don't check the clock.</p>

            </div>

            <div>

              <span>FOLLOW THE FLAVOUR</span>

              <strong>

                <a href="https://www\.instagram.com/" target="_blank" rel="noreferrer">

                  @foodieexpress <ArrowUpRight />

                </a>

              </strong>

              <p>Behind-the-scenes, new dishes and food love.</p>

            </div>

          </div>

        </section>}

      </main>



      <footer className="site-footer">

        <div className="footer-top">

          <a className="brand brand--footer" href="/">

            <span className="brand__mark">

              f<span>.</span>

            </span>

            <span className="brand__word">

              foodie<span>express</span>

            </span>

          </a>

          <p>

            Good food. Better days.

            <br />

            Made with a little more love.

          </p>

          <nav className="footer-navigation" aria-label="Footer navigation">
            {storefrontNavigation.map(([id, label, href]) => (
              <a key={id} href={href}>{label}</a>
            ))}
          </nav>
          <a className="back-top" href={pageTopLinks[page]}>
            Back to the top ↑
          </a>
        </div>



        <div className="footer-bottom">

          <span>

            © {new Date().getFullYear()} FoodieExpress. Made for food lovers.

          </span>

          <span>

            FRESH FLAVOURS. FULL HEARTS. <span className="orange">✳</span>

          </span>

          <span className="demo-note">

            Local demo · Orders are saved to MySQL; no online payment

          </span>

        </div>

      </footer>



      {cartOpen && (

        <div className="cart-overlay" onClick={() => setCartOpen(false)}>

          <aside

            className="cart-drawer"

            role="dialog"

            aria-modal="true"

            aria-label="Your shopping bag"

            onClick={(event) => event.stopPropagation()}

          >

            <div className="cart-drawer__header">

              <div>

                <span className="eyebrow">

                  <span className="eyebrow-line" />

                  YOUR GOODIES

                </span>

                <h2>

                  Your bag <span>({cartCount})</span>

                </h2>

              </div>

              <button

                className="cart-close"

                type="button"

                onClick={() => setCartOpen(false)}

                aria-label="Close cart"

              >

                ×

              </button>

            </div>



            {cartItems.length === 0 && bundleCartItems.length === 0 ? (

              <div className="cart-empty">

                <span>♡</span>

                <h3>Your bag is taking a break.</h3>

                <p>Let's find something delicious.</p>

                <button

                  className="button button--dark"

                  type="button"

                  onClick={browseMenu}

                >

                  Explore the menu ↗

                </button>

              </div>

            ) : (

              <>

                <div className="cart-items">
                  {bundleCartItems.map((bundle) => (
                    <div className="cart-item cart-item--bundle" key={`bundle-${bundle.id}`}>
                      <img src={bundle.image || undefined} alt={bundle.title} />
                      <div className="cart-item__details">
                        <strong>{bundle.title}</strong>
                        <div className="cart-item__prices">
                          <span>Bundle · ₹{Number(bundle.price).toFixed(2)}</span>
                          <del>₹{Number(bundle.originalPrice).toFixed(2)}</del>
                        </div>
                        <span className="cart-item__offer">
                          {bundle.items.map((item) => `${item.name} × ${item.quantity}`).join(" · ")}
                        </span>
                        <div className="cart-quantity">
                          <button
                            type="button"
                            onClick={() => changeBundleQuantity(bundle, -1)}
                            aria-label={`Remove one ${bundle.title}`}
                          >−</button>
                          <span>{bundleCart[bundle.id]}</span>
                          <button
                            type="button"
                            onClick={() => changeBundleQuantity(bundle, 1)}
                            aria-label={`Add one ${bundle.title}`}
                          >+</button>
                        </div>
                      </div>
                      <strong className="cart-item__line-total">
                        ₹{(Math.round(Number(bundle.price) * 100) * bundleCart[bundle.id]) / 100}
                      </strong>
                    </div>
                  ))}
                  {cartItems.map((dish) => (

                    <div className="cart-item" key={dish.id}>

                      <img src={dish.image || undefined} alt={dish.name} />



                      <div className="cart-item__details">

                        <strong>{dish.name}</strong>

                        <div className="cart-item__prices">
                          <span>₹{(offerUnitPriceCents(dish) / 100).toFixed(2)} each</span>
                          <del>₹{dish.oldPrice}</del>
                        </div>
                        {dish.offer && (
                          <span className="cart-item__offer">
                            {offerBadge(dish.offer)}
                            {dish.offer.type === "bogo" && cart[dish.id] > 1
                              ? ` · ${Math.floor(cart[dish.id] / 2)} free`
                              : ""}
                          </span>
                        )}



                        <div className="cart-quantity">

                          <button

                            type="button"

                            onClick={() => changeQuantity(dish, -1)}

                            aria-label={`Remove one ${dish.name}`}

                          >

                            −

                          </button>

                          <span>{cart[dish.id]}</span>

                          <button

                            type="button"

                            onClick={() => changeQuantity(dish, 1)}

                            aria-label={`Add one ${dish.name}`}

                          >

                            +

                          </button>

                        </div>

                      </div>



                      <strong className="cart-item__line-total">
                        ₹{(Math.round(Number(dish.price) * 100) * cart[dish.id]
                          - offerSavingsCents(dish, cart[dish.id])) / 100}

                      </strong>

                    </div>

                  ))}

                </div>



                <div className="cart-summary">

                  <div>

                    <span>Original price</span>

                    <strong>₹{originalTotal}</strong>

                  </div>



                  <div className="cart-savings">

                    <span>Product &amp; offer savings</span>

                    <strong>−₹{itemDiscount}</strong>

                  </div>



                  <div>

                    <span>Discounted subtotal</span>

                    <strong>₹{cartTotal}</strong>

                  </div>



                  <div className={extraDiscount > 0 ? "cart-savings" : "cart-threshold"}>

                    <span>

                      Extra 10% order discount{" "}

                      {extraDiscount === 0 ? "(orders above ₹500)" : ""}

                    </span>

                    <strong>

                      {extraDiscount > 0

                        ? `−₹${extraDiscount}`

                        : "Not unlocked"}

                    </strong>

                  </div>



                  <div className="cart-grand-total">

                    <strong>Total to pay</strong>

                    <strong>₹{finalTotal}</strong>

                  </div>



                  <p className="cart-discount-note">

                    {extraDiscount > 0

                      ? "Your extra 10% discount has been applied!"

                      : `Add ₹${Math.max(0, 501 - cartTotal)} more to unlock an extra 10% off.`}

                  </p>



                  <form className="checkout-form" onSubmit={handleCheckout}>
                    <h3>Delivery details</h3>
                    {savedAddresses.length > 0 && (
                      <select className="checkout-input" defaultValue=""
                        aria-label="Use a saved delivery address"
                        onChange={(event) => {
                          const address = savedAddresses.find((item) => String(item.id) === event.target.value);
                          if (!address) return;
                          setCustomerName(address.recipient);
                          setCustomerPhone(address.phone);
                          setCustomerAddress([
                            address.line1, address.line2, address.city, address.state, address.postalCode,
                          ].filter(Boolean).join(", "));
                          setDeliveryCity(address.city);
                          setDeliveryState(address.state);
                          setDeliveryPostalCode(address.postalCode);
                        }}>
                        <option value="">Enter delivery details or use a saved address</option>
                        {savedAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label} — {address.line1}, {address.city}
                          </option>
                        ))}
                      </select>
                    )}
                    <input className="checkout-input" type="text" placeholder="Your full name"
                      value={customerName} onChange={(event) => setCustomerName(event.target.value)}
                      autoComplete="name" maxLength={120} required />
                    <input className="checkout-input" type="tel" placeholder="Phone number"
                      value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)}
                      autoComplete="tel" maxLength={20} required />
                    <textarea className="checkout-input" placeholder="Full delivery address"
                      value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)}
                      autoComplete="street-address" rows={3} maxLength={1000} required />
                    <div className="checkout-location-fields">
                      <input className="checkout-input" type="text" placeholder="City"
                        value={deliveryCity} onChange={(event) => setDeliveryCity(event.target.value)}
                        autoComplete="address-level2" maxLength={100} required />
                      <input className="checkout-input" type="text" placeholder="State"
                        value={deliveryState} onChange={(event) => setDeliveryState(event.target.value)}
                        autoComplete="address-level1" maxLength={100} required />
                      <input className="checkout-input checkout-location-fields__postal" type="text" placeholder="Postal code"
                        value={deliveryPostalCode} onChange={(event) => setDeliveryPostalCode(event.target.value)}
                        autoComplete="postal-code" maxLength={20} required />
                    </div>
                    <p className="checkout-location-hint">Your delivery address and area are saved with this order so the restaurant can route it correctly.</p>
<button
  className="button button--dark cart-continue"
  type="submit"
  disabled={orderSubmitting}
>
                      {orderSubmitting ? "Saving order..." : `Place order · ₹${finalTotal}`}
                    </button>
                  </form>

                  <button

                    className="button button--dark cart-continue"

                    type="button"

                    onClick={browseMenu}

                  >

                    Continue browsing <ArrowUpRight />

                  </button>



                  <small className="cart-demo-note">
                    Demo checkout saves orders to your local MySQL database. No online payment is processed.
                  </small>

                </div>

              </>

            )}

          </aside>

        </div>

      )}



      {toast && (

        <div className={`toast${toastError ? " toast--error" : ""}`} role={toastError ? "alert" : "status"}>

          <span>{toastError ? "!" : "✓"}</span>

          {toast}

          <small>Demo interaction</small>

        </div>

      )}

    </div>

  );

}