// Seleciona os elementos
const btnMenu = document.querySelector(".btn-menu-header");
const menu = document.querySelector(".ul-header");

// Adiciona evento de clique
btnMenu.addEventListener("click", () => {
  menu.classList.toggle("active");
  btnMenu.classList.toggle("open");
});

// Fecha o menu ao clicar em um link (opcional)
const menuLinks = document.querySelectorAll(".link-item-li");
menuLinks.forEach((link) => {
  link.addEventListener("click", () => {
    menu.classList.remove("active");
    btnMenu.classList.remove("open");
  });
});

const btnFechar = document.querySelector(".btn-fechar-menu");

btnFechar.addEventListener("click", () => {
  menu.classList.remove("active");
  btnMenu.classList.remove("open");
});

const elementos = document.querySelectorAll(".animar-direita");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("ativo");
      }
    });
  },
  { threshold: 0.5 },
);

elementos.forEach((el) => observer.observe(el));
