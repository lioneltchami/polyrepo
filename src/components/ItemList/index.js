import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import "./ItemList.css";
import Item from "../Item";
import Pagination from "../Pagination";

const PAGE_SIZE = 12;

const API_CONFIG = {
  github: {
    url: (q, page) =>
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${PAGE_SIZE}&page=${page}`,
    parse: (data) => (data.items || []).map(item => ({
      source: "github",
      name: item.name,
      url: item.html_url,
      author: item.owner?.login,
      avatar: item.owner?.avatar_url,
      stars: item.stargazers_count || 0,
      forks: item.forks || 0,
      issues: item.open_issues || 0,
      language: item.language || "",
      description: item.description || "",
    })),
  },
  gitlab: {
    url: (q, page) =>
      `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=${PAGE_SIZE}&page=${page}`,
    parse: (data) => (data || []).map(item => ({
      source: "gitlab",
      name: item.name,
      url: item.web_url,
      author: item.namespace?.name,
      avatar: item.namespace?.avatar_url
        ? (item.namespace.avatar_url.startsWith("http")
            ? item.namespace.avatar_url
            : `https://gitlab.com${item.namespace.avatar_url}`)
        : "",
      stars: item.star_count || 0,
      forks: item.forks_count || 0,
      issues: 0,
      language: item.language || "",
      description: item.description || "",
    })),
  },
  bitbucket: {
    url: (q, page) => {
      // Bitbucket's `q` uses Lucene syntax with a name~"..." literal.
      // Escape embedded backslashes and double-quotes in the user input
      // so a query like `foo"bar` can't break out of the literal.
      const escaped = q.replace(/[\\"]/g, "\\$&");
      return `https://api.bitbucket.org/2.0/repositories/?q=name~"${escaped}"&pagelen=${PAGE_SIZE}&page=${page}`;
    },
    parse: (data) => (data.values || []).map(item => ({
      source: "bitbucket",
      name: item.name,
      url: item.links?.html?.href || "",
      author: item.owner?.display_name,
      avatar: item.owner?.links?.avatar?.href,
      stars: 0,
      forks: 0,
      issues: 0,
      language: item.language || "",
      description: item.description || "",
    })),
  },
};

// Detect rate-limit responses per source. GitHub returns 403 + a
// `message` containing "rate limit"; GitLab returns 429; Bitbucket
// returns 429. We expose a friendly hint so the UI can show it
// instead of a silent "No projects found".
function detectRateLimit(source, res, data) {
  if (res.status === 429) return true;
  if (res.status === 403 && source === "github") {
    const msg = (data && data.message) || "";
    return /rate limit/i.test(msg);
  }
  return false;
}

const SOURCE_LABELS = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

function errorMessage(source, kind) {
  const name = SOURCE_LABELS[source] || source;
  if (kind === "rate_limited") {
    return `${name} rate limit reached — wait a minute or try another source.`;
  }
  if (kind === "network_error") {
    return `${name} is unreachable. Check your connection.`;
  }
  return `${name} returned an error.`;
}

function ItemList({ search, filters, shouldSearch, onSearchComplete }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [sourceErrors, setSourceErrors] = useState({});

  // Live AbortController for the most recent fetchAll. Stored in a ref so
  // it survives across renders without changing identity (which would
  // re-trigger the page-change effect).
  const controllerRef = useRef(null);

  // True only when the user clicked a Pagination button — distinguishes a
  // genuine page change from the setCurrentPage(1) reset that happens when
  // a new search/filter change kicks off. Without this flag, the
  // page-change effect would re-fire every time the new-search effect
  // resets the page, causing a duplicate fetch.
  const userPageChangeRef = useRef(false);

  const handlePageChange = useCallback((newPage) => {
    userPageChangeRef.current = true;
    setCurrentPage(newPage);
  }, []);

  const fetchFromSource = useCallback(async (source, query, page, signal) => {
    try {
      const config = API_CONFIG[source];
      const res = await fetch(config.url(query, page), { signal });
      const data = await res.json();

      if (detectRateLimit(source, res, data)) {
        setSourceErrors(prev => ({ ...prev, [source]: "rate_limited" }));
        return [];
      }
      if (!res.ok) {
        setSourceErrors(prev => ({ ...prev, [source]: "http_error" }));
        return [];
      }

      // Clear any previous error for this source on a successful fetch.
      setSourceErrors(prev => {
        if (!prev[source]) return prev;
        const { [source]: _drop, ...rest } = prev;
        return rest;
      });
      return config.parse(data);
    } catch (err) {
      // AbortError is expected when a newer search / page change cancels
      // this in-flight request. Treat it as a no-op, not a real failure.
      if (err.name === "AbortError") {
        return [];
      }
      console.error(`Error fetching from ${source}:`, err);
      setSourceErrors(prev => ({ ...prev, [source]: "network_error" }));
      return [];
    }
  }, []);

  const fetchAll = useCallback(async (query, page = 1) => {
    // Cancel any in-flight request before starting a new one. Without this,
    // a slow earlier fetch could resolve *after* a faster newer one and
    // overwrite fresh results with stale data (the classic fetch race).
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setSourceErrors({});

    const sources = filters.source === "all"
      ? ["github", "gitlab", "bitbucket"]
      : [filters.source];

    // Pagination model — keep this comment intact so a future reader
    // doesn't think we re-fetch on every filter change:
    //   • Single source: the API returns exactly one page of PAGE_SIZE
    //     items. Clean server-driven pagination.
    //   • "all" sources: each source returns one page; we merge across
    //     sources and slice in memory to a single PAGE_SIZE. This is a
    //     known limitation — true cross-source pagination (page 5 = github
    //     p5 + gitlab p5 + bitbucket p5, sorted/merged) needs a separate
    //     design and is out of scope here. To paginate further, switch
    //     to a single-source filter.
    //   • The client-side `language` filter narrows the already-fetched
    //     page; it does not trigger a refetch.
    const results = await Promise.all(
      sources.map(source => fetchFromSource(source, query, page, controller.signal))
    );

    // If we were aborted while awaiting Promise.all, drop the result.
    if (controller.signal.aborted) return;

    let allItems = results.flat().sort((a, b) => b.stars - a.stars);
    if (filters.source === "all") {
      // Trim the merged result down to a single page (see known
      // limitation above).
      allItems = allItems.slice(0, PAGE_SIZE);
    }

    setItems(allItems);
    setLoading(false);
    onSearchComplete?.();
  }, [filters.source, fetchFromSource, onSearchComplete]);

  // New search trigger: fires when shouldSearch flips true (from a new
  // keyword, or from App updating filters while a search is active).
  // Resets currentPage to 1 so the next effect sees the new state.
  useEffect(() => {
    if (shouldSearch && search.trim()) {
      setSearched(true);
      setCurrentPage(1);
      fetchAll(search, 1);
    }
  }, [shouldSearch, search, fetchAll]);

  // Page-change trigger: only re-fetches when the user actually clicked
  // a Pagination button. The userPageChangeRef guards against spurious
  // refetches when the new-search effect resets the page back to 1.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userPageChangeRef.current) return;
    userPageChangeRef.current = false;
    if (!searched || shouldSearch || !search.trim()) return;
    fetchAll(search, currentPage);
  }, [currentPage]);

  // Abort any in-flight fetch when the component unmounts so we don't
  // call setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  const filteredItems = useMemo(() => {
    let result = [...items];

    // Filter by source (already done at fetch time if specific source)
    if (filters.source !== "all") {
      result = result.filter(i => i.source === filters.source);
    }

    // Filter by language
    if (filters.language !== "all") {
      result = result.filter(i =>
        i.language?.toLowerCase() === filters.language.toLowerCase()
      );
    }

    // Sort
    if (filters.sort !== "all") {
      const key = filters.sort === "star" ? "stars"
                : filters.sort === "fork" ? "forks"
                : "issues";
      result.sort((a, b) =>
        filters.order === "desc" ? b[key] - a[key] : a[key] - b[key]
      );
    }

    return result;
  }, [items, filters]);

  if (!searched) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⌘</div>
        <p>Enter a keyword to search open-source projects</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Searching...</p>
      </div>
    );
  }

  const errorEntries = Object.entries(sourceErrors);
  const onlyErrors = errorEntries.length > 0 && filteredItems.length === 0;

  if (onlyErrors) {
    return (
      <div className="empty-state">
        <div className="empty-icon">!</div>
        {errorEntries.map(([source, kind]) => (
          <p key={source} className="error-line">{errorMessage(source, kind)}</p>
        ))}
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">∅</div>
        <p>No projects found</p>
      </div>
    );
  }

  return (
    <div className="item-list">
      <div className="results-count">
        {filteredItems.length} project{filteredItems.length !== 1 ? "s" : ""} found
      </div>

      {errorEntries.length > 0 && (
        <div className="results-warning" role="status">
          {errorEntries.map(([source, kind]) => (
            <p key={source} className="error-line">{errorMessage(source, kind)}</p>
          ))}
        </div>
      )}

      <div className="items-grid">
        {filteredItems.map((item, index) => (
          <Item key={`${item.source}-${item.name}-${index}`} {...item} />
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalCount={filteredItems.length}
        pageSize={PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

export default ItemList;
