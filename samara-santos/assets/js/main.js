/* =========================================================
   CONFIGURAÇÃO — ajuste antes de publicar
   ========================================================= */
const CONFIG = {
  // Número do WhatsApp com DDI + DDD, só dígitos (ex.: 5532999999999).
  // Deixe vazio enquanto não tiver o número: os botões levam para a seção de contato.
  whatsapp: "",
  // @ do Instagram (sem o @). Confirmar o nome completo do perfil.
  instagram: "massoterapeuta__samarasantos",
};

document.documentElement.classList.remove("no-js");

/* ---------- Links de WhatsApp / Instagram ---------- */
const waLink = (msg) =>
  CONFIG.whatsapp
    ? `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`
    : "#contato";

function wireWhatsApp(el) {
  const msg = el.dataset.wa || "Olá, Samara! Vim pelo site e gostaria de agendar um horário.";
  el.href = waLink(msg);
  if (CONFIG.whatsapp) { el.target = "_blank"; el.rel = "noopener"; }
}
document.querySelectorAll("[data-wa]").forEach(wireWhatsApp);

const instaUrl = `https://www.instagram.com/${CONFIG.instagram}/`;
document.querySelectorAll("[data-insta]").forEach((el) => {
  el.href = instaUrl; el.target = "_blank"; el.rel = "noopener";
});
document.querySelectorAll(".insta-handle").forEach((el) => (el.textContent = "@" + CONFIG.instagram));

/* ---------- Nav ---------- */
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav__toggle");
const waFloat = document.querySelector(".wa-float");

const onScroll = () => {
  const y = window.scrollY;
  nav.classList.toggle("is-scrolled", y > 30);
  waFloat.classList.toggle("is-visible", y > window.innerHeight * 0.6);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const setMenu = (open) => {
  nav.classList.toggle("menu-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  document.body.style.overflow = open ? "hidden" : "";
};
toggle.addEventListener("click", () => setMenu(!nav.classList.contains("menu-open")));
document.querySelectorAll(".mobile-menu a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }),
  { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- Tilt suave na foto do hero ---------- */
const tilt = document.querySelector("[data-tilt]");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (tilt && !reduce && window.matchMedia("(hover: hover)").matches) {
  const hero = document.querySelector(".hero");
  hero.addEventListener("mousemove", (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.transform = `perspective(1000px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
  });
  hero.addEventListener("mouseleave", () => (tilt.style.transform = ""));
}

/* ---------- Quiz: qual serviço é ideal ---------- */
const QUIZ = {
  relax: {
    name: "Massagem Relaxante",
    why: "Para desacelerar, soltar a musculatura e dormir melhor. Um respiro no meio da rotina.",
  },
  drenagem: {
    name: "Drenagem Linfática",
    why: "Manobras suaves que ajudam a reduzir o inchaço e deixam as pernas leves.",
  },
  modeladora: {
    name: "Massagem Modeladora",
    why: "Movimentos firmes que trabalham o contorno e melhoram o aspecto da pele.",
  },
  dores: {
    name: "Massoterapia para Dores",
    why: "Foco nos pontos de tensão de pescoço, ombros e costas para devolver o conforto.",
  },
  sobrancelhas: {
    name: "Design de Sobrancelhas",
    why: "Um design pensado para o formato do seu rosto, valorizando o olhar com naturalidade.",
  },
};
const quizButtons = document.querySelectorAll(".quiz__options button");
const quizResult = document.querySelector(".quiz__result");
const quizCta = document.querySelector(".quiz__cta");
quizButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const item = QUIZ[btn.dataset.pick];
    quizButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
    quizResult.classList.remove("is-on");
    void quizResult.offsetWidth; // reinicia a animação
    quizResult.querySelector(".quiz__name").textContent = item.name;
    quizResult.querySelector(".quiz__why").textContent = item.why;
    quizCta.dataset.wa = `Olá, Samara! Fiz o teste no site e me interessei pela ${item.name}.`;
    wireWhatsApp(quizCta);
    quizResult.classList.add("is-on");
  })
);

/* ---------- Carrossel de feedbacks ---------- */
const carousel = document.querySelector(".carousel");
document.querySelectorAll(".carousel-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    const card = carousel.querySelector(".quote");
    const step = card.getBoundingClientRect().width + 22;
    carousel.scrollBy({ left: step * Number(btn.dataset.dir), behavior: "smooth" });
  })
);

/* ---------- Ano no rodapé ---------- */
document.getElementById("year").textContent = new Date().getFullYear();
