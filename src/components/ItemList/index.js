import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./ItemList.css";
import Item from "../Item";
import Pagination from "../Pagination";

const API_CONFIG = {
  github: {
    url: (q) => `https://api.github.com/search/repositories?q=${q}&per_page=100`,
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
    url: (q) => `https://gitlab.com/api/v4/projects?search=${q}&per_page=100`,
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
    url: (q) => {
      // Bitbucket's `q` uses Lucene syntax with a name~"..." literal.
      // Escape embedded backslashes and double-quotes in the user input
      // so a query like `foo"bar` can't break out of the literal.
      const escaped = q.replace(/[\\"]/g, "\\$&");
      return `https://api.bitbucket.org/2.0/repositories/?q=name~"${escaped}"`;
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

const PAGE_SIZE = 12;

function ItemList({ search, filters, shouldSearch, onSearchComplete }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [sourceErrors, setSourceErrors] = useState({});

  const fetchFromSource = useCallback(async (source, query) => {
    try {
      const config = API_CONFIG[source];
      const res = await fetch(config.url(encodeURIComponent(query)));
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
      console.error(`Error fetching from ${source}:`, err);
      setSourceErrors(prev => ({ ...prev, [source]: "network_error" }));
      return [];
    }
  }, []);

  const fetchAll = useCallback(async (query) => {
    setLoading(true);
    setSearched(true);
    setCurrentPage(1);
    setSourceErrors({});

    const sources = filters.source === "all"
      ? ["github", "gitlab", "bitbucket"]
      : [filters.source];

    const results = await Promise.all(
      sources.map(source => fetchFromSource(source, query))
    );

    const allItems = results.flat().sort((a, b) => b.stars - a.stars);
    setItems(allItems);
    setLoading(false);
    onSearchComplete?.();
  }, [filters.source, fetchFromSource, onSearchComplete]);

  useEffect(() => {
    if (shouldSearch && search.trim()) {
      fetchAll(search);
    }
  }, [shouldSearch, search, fetchAll]);

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

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

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
        {paginatedItems.map((item, index) => (
          <Item key={`${item.source}-${item.name}-${index}`} {...item} />
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalCount={filteredItems.length}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export default ItemList;
