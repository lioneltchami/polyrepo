import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "./index";

const PAGE_SIZE = 12;

function renderPagination({ currentPage = 1, totalCount, onPageChange = jest.fn() } = {}) {
  const utils = render(
    <Pagination
      currentPage={currentPage}
      totalCount={totalCount}
      pageSize={PAGE_SIZE}
      onPageChange={onPageChange}
    />
  );
  return { ...utils, onPageChange };
}

describe("Pagination", () => {
  test("renders nothing when totalPages <= 1", () => {
    const { container } = renderPagination({ totalCount: 0 });
    expect(container).toBeEmptyDOMElement();

    render(
      <Pagination
        currentPage={1}
        totalCount={PAGE_SIZE}
        pageSize={PAGE_SIZE}
        onPageChange={jest.fn()}
      />
    );
    // totalCount === pageSize => totalPages === 1 => still no render
    expect(screen.queryByRole("navigation", { name: /pagination/i })).not.toBeInTheDocument();
  });

  test("renders all pages without ellipsis when totalPages <= 7", () => {
    const { container } = renderPagination({ totalCount: PAGE_SIZE * 5 });
    const buttons = container.querySelectorAll("button.page-btn");
    // 5 page buttons + prev + next
    expect(buttons.length).toBe(7);
    expect(container.querySelector(".page-dots")).toBeNull();
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toEqual(["←", "1", "2", "3", "4", "5", "→"]);
  });

  test("renders right-ellipsis pattern when on early pages", () => {
    const totalCount = PAGE_SIZE * 10; // 10 pages
    const { container } = renderPagination({ currentPage: 1, totalCount });
    const labels = Array.from(container.querySelectorAll(".page-btn, .page-dots"))
      .map((el) => el.textContent);
    expect(labels).toEqual(["←", "1", "2", "3", "4", "5", "...", "10", "→"]);
  });

  test("renders left-ellipsis pattern when on late pages", () => {
    const totalCount = PAGE_SIZE * 10;
    const { container } = renderPagination({ currentPage: 10, totalCount });
    const labels = Array.from(container.querySelectorAll(".page-btn, .page-dots"))
      .map((el) => el.textContent);
    expect(labels).toEqual(["←", "1", "...", "6", "7", "8", "9", "10", "→"]);
  });

  test("renders both ellipses on a middle page", () => {
    const totalCount = PAGE_SIZE * 10;
    const { container } = renderPagination({ currentPage: 5, totalCount });
    const labels = Array.from(container.querySelectorAll(".page-btn, .page-dots"))
      .map((el) => el.textContent);
    expect(labels).toEqual(["←", "1", "...", "4", "5", "6", "...", "10", "→"]);
  });

  test("Previous button is disabled on page 1", () => {
    const { container } = renderPagination({ currentPage: 1, totalCount: PAGE_SIZE * 5 });
    const prev = screen.getByRole("button", { name: /previous page/i });
    expect(prev).toBeDisabled();
    // sanity: it is the first page button in the DOM
    const firstBtn = container.querySelector("button.page-btn");
    expect(firstBtn).toBe(prev);
  });

  test("Next button is disabled on the last page", () => {
    const totalCount = PAGE_SIZE * 5; // 5 pages
    const { container } = renderPagination({ currentPage: 5, totalCount });
    const next = screen.getByRole("button", { name: /next page/i });
    expect(next).toBeDisabled();
    const buttons = container.querySelectorAll("button.page-btn");
    expect(buttons[buttons.length - 1]).toBe(next);
  });

  test("clicking a page button calls onPageChange with the correct value", async () => {
    const onPageChange = jest.fn();
    const totalCount = PAGE_SIZE * 5;
    const user = userEvent.setup();
    renderPagination({ currentPage: 2, totalCount, onPageChange });

    await user.click(screen.getByRole("button", { name: "4" }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  test("the active page has aria-current='page'", () => {
    const totalCount = PAGE_SIZE * 5;
    const { container } = renderPagination({ currentPage: 3, totalCount });

    const active = container.querySelector('[aria-current="page"]');
    expect(active).not.toBeNull();
    expect(active).toHaveTextContent("3");

    // Non-active pages should not have aria-current
    const page4 = screen.getByRole("button", { name: "4" });
    expect(page4).not.toHaveAttribute("aria-current");
  });
});