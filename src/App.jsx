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





function FoodCard({ dish, onAdd }) {

  const discount = Math.round(

    ((dish.oldPrice - dish.price) / dish.oldPrice) * 100

  );



  return (

    <article className="food-card">

      <div className="food-card__image-wrap">

        <img

          className="food-card__image"

          src={dish.image || undefined}

          alt={dish.name}

          loading="lazy"

        />

        <span className="food-tag">{dish.tag}</span>

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

          <strong className="sale-price">₹{dish.price}</strong>

          <span className="old-price">₹{dish.oldPrice}</span>

          <span className="discount-badge">{discount}% OFF</span>

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

export default function App() {
  const [dishes, setDishes] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  const [cart, setCart] = useState(loadSavedCart);

  const [cartOpen, setCartOpen] = useState(false);

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
    try {
      window.localStorage.setItem("foodieexpress-cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Cart could not be saved:", error);
    }
  }, [cart]);



  useEffect(() => {
    let active = true;

    async function loadDishes() {
      try {
        const response = await fetch(`${API_BASE_URL}/foods`);
        if (!response.ok) throw new Error("Unable to load the menu.");
        const data = await response.json();
        if (active) setDishes(data);
      } catch (error) {
        console.error("Menu loading failed:", error);
        if (active) setMenuError("Unable to load the menu. Please check that the backend is running.");
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

  );



  const cartItems = dishes.filter((dish) => cart[dish.id] > 0);



  const cartTotalCents = cartItems.reduce(
    (sum, dish) => sum + Math.round(Number(dish.price) * 100) * cart[dish.id],
    0,
  );
  const originalTotalCents = cartItems.reduce(
    (sum, dish) => sum + Math.round(Number(dish.oldPrice) * 100) * cart[dish.id],
    0,
  );
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



  function changeQuantity(dish, amount) {
    if (amount > 0 && (cart[dish.id] || 0) >= 99) {
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



  function handleSubscribe(event) {

    event.preventDefault();



    if (!email.trim()) return;



    setSubscribed(true);

    setEmail("");

  }




  async function handleCheckout(event) {
    event.preventDefault();
    if (cartItems.length === 0 || orderSubmitting) return;
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: customerPhone.trim(),
          address: customerAddress.trim(),
          items: cartItems.map((dish) => ({
            id: dish.id,
            quantity: cart[dish.id],
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not place order (HTTP ${response.status}).`);

      setCart({});
      setCartOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
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

    document.getElementById("menu")?.scrollIntoView({

      behavior: "smooth",

    });

  }



  return (

    <div className="site-shell">

      <div className="announcement">

        <span className="announcement__spark">✳</span>

        <span>

          Good food, good mood.{" "}

          <strong>Free delivery on your first order over ₹499.</strong>

        </span>

        <a href="#menu">

          Explore the menu <span>↗</span>

        </a>

      </div>



      <header className="site-header">

        <a className="brand" href="#home" aria-label="FoodieExpress home">

          <span className="brand__mark">

            f<span>.</span>

          </span>

          <span className="brand__word">

            foodie<span>express</span>

          </span>

        </a>



        <nav className="main-nav" aria-label="Main navigation">

          <a className="active" href="#home">Home</a>

          <a href="#menu">Our menu</a>

          <a href="#story">Our story</a>

          <a href="#reviews">Kind words</a>

          <a href="#contact">Contact</a>

        </nav>



        <div className="header-actions">

          <a className="header-order" href="#menu">

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

            onClick={browseMenu}

            aria-label="Jump to menu"

          >

            <span />

            <span />

          </button>

        </div>

      </header>



      <main>

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

              <a className="button button--dark" href="#menu">

                Explore the menu <ArrowUpRight />

              </a>

              <a className="text-link" href="#story">

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



        <section className="menu-section section-pad" id="menu">

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
                <FoodCard key={dish.id} dish={dish} onAdd={addToBag} />
              ))
            )}
          </div>

          <div className="menu-bottom">

            <span>GOOD THINGS TAKE A LITTLE PREP.</span>

            <span>

              Made fresh when you order <span className="orange">✳</span>

            </span>

          </div>

        </section>



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

            <a className="button button--outline" href="#story">

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

              <a className="text-link" href="#contact">

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



        <section className="contact-section section-pad" id="contact">

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

        </section>

      </main>



      <footer className="site-footer">

        <div className="footer-top">

          <a className="brand brand--footer" href="#home">

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

          <a className="back-top" href="#home">

            Back to the top ↑

          </a>
          <a className="footer-admin-link" href="/admin">
            Menu admin ↗
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



            {cartItems.length === 0 ? (

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

                  {cartItems.map((dish) => (

                    <div className="cart-item" key={dish.id}>

                      <img src={dish.image || undefined} alt={dish.name} />



                      <div className="cart-item__details">

                        <strong>{dish.name}</strong>

                        <div className="cart-item__prices">

                          <span>₹{dish.price} each</span>

                          <del>₹{dish.oldPrice}</del>

                        </div>



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
                        ₹{Math.round(Number(dish.price) * 100) * cart[dish.id] / 100}

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

                    <span>Product discounts</span>

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
                    <input className="checkout-input" type="text" placeholder="Your full name"
                      value={customerName} onChange={(event) => setCustomerName(event.target.value)}
                      autoComplete="name" maxLength={120} required />
                    <input className="checkout-input" type="tel" placeholder="Phone number"
                      value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)}
                      autoComplete="tel" maxLength={20} pattern="^[+()0-9\\s-]{7,20}$" required />
                    <textarea className="checkout-input" placeholder="Full delivery address"
                      value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)}
                      autoComplete="street-address" rows={3} maxLength={1000} required />
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