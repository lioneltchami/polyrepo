import React from "react";
import { render, screen } from "@testing-library/react";
import Item from "./index";

const BASE_PROPS = {
  source: "github",
  name: "short-name",
  url: "https://github.com/example/short-name",
  author: "octocat",
  avatar: "https://github.com/images/octocat.png",
  stars: 1200,
  forks: 300,
  issues: 12,
  language: "JavaScript",
  description: "A small project description.",
};

function renderItem(overrides = {}) {
  return render(<Item {...BASE_PROPS} {...overrides} />);
}

describe("Item — formatNumber helper", () => {
  test("formatNumber(1500) returns '1.5k' (rendered as ★ 1.5k)", () => {
    renderItem({ stars: 1500, forks: 0, issues: 0 });
    // Stars and forks share the same formatter; check stars specifically.
    expect(screen.getByText(/★\s*1\.5k/)).toBeInTheDocument();
  });

  test("formatNumber(999) returns '999'", () => {
    renderItem({ stars: 999, forks: 0, issues: 0 });
    expect(screen.getByText(/★\s*999/)).toBeInTheDocument();
  });

  test("formatNumber(0) and formatNumber(undefined) both return '0'", () => {
    renderItem({ stars: 0, forks: undefined, issues: undefined });
    expect(screen.getByText(/★\s*0/)).toBeInTheDocument();
    // Forks and issues (github) use the same helper; verify a second '0' shows up
    // via the issues/forks spans being rendered with "0".
    const statLines = screen.getAllByText(/0/);
    expect(statLines.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Item — rendering", () => {
  test("renders the source icon for github", () => {
    const { container } = renderItem({ source: "github" });
    expect(container.querySelector(".source-icon")).toBeInTheDocument();
  });

  test("renders the source icon for gitlab", () => {
    const { container } = renderItem({ source: "gitlab" });
    expect(container.querySelector(".source-icon")).toBeInTheDocument();
  });

  test("renders the source icon for bitbucket", () => {
    const { container } = renderItem({ source: "bitbucket" });
    expect(container.querySelector(".source-icon")).toBeInTheDocument();
  });

  test("truncates name longer than 28 chars with '...'", () => {
    const longName = "a".repeat(40); // 40 chars
    renderItem({ name: longName });
    const title = screen.getByRole("heading", { level: 3 });
    expect(title.textContent).toBe("a".repeat(28) + "...");
    expect(title.textContent.length).toBe(31);
  });

  test("truncates description longer than 100 chars with '...'", () => {
    const longDesc = "x".repeat(150);
    renderItem({ description: longDesc });
    const desc = screen.getByText(/^x+\.\.\.$/);
    expect(desc.textContent).toBe("x".repeat(100) + "...");
    expect(desc.textContent.length).toBe(103);
  });

  test("shows 'No description' when description is empty", () => {
    renderItem({ description: "" });
    expect(screen.getByText(/no description/i)).toBeInTheDocument();
  });

  test("hides the language badge when language is empty", () => {
    const { container } = renderItem({ language: "" });
    expect(container.querySelector(".item-lang")).toBeNull();
  });

  test("shows the issues count only when source is 'github'", () => {
    // github: issues visible
    const { rerender, container } = renderItem({ source: "github", issues: 42 });
    expect(screen.getByText(/◉\s*42/)).toBeInTheDocument();

    // gitlab: issues hidden
    rerender(<Item {...BASE_PROPS} source="gitlab" issues={42} />);
    expect(container.querySelector(".item-stats").textContent).not.toMatch(/◉/);

    // bitbucket: issues hidden
    rerender(<Item {...BASE_PROPS} source="bitbucket" issues={42} />);
    expect(container.querySelector(".item-stats").textContent).not.toMatch(/◉/);
  });

  test("the card is wrapped in an <a> with target='_blank' and rel='noopener noreferrer'", () => {
    const { container } = renderItem();
    const link = container.querySelector("a.item");
    expect(link).not.toBeNull();
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("href")).toBe(BASE_PROPS.url);
  });
});