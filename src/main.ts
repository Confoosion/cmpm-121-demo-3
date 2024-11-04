// todo
function createButton() {
  const button = document.createElement("button");

  button.textContent = "Click Me";

  button.addEventListener("click", () => {
    alert("You clicked the button!");
  });

  document.body.appendChild(button);
}

createButton();
