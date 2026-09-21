import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

describe('App', () => {
  test('renders the brand logo', () => {
    const { getByText } = render(<App />);
    expect(getByText(/zzollo/i)).toBeInTheDocument();
  });

  test('renders the search input', () => {
    const { getByPlaceholderText } = render(<App />);
    expect(getByPlaceholderText(/search projects/i)).toBeInTheDocument();
  });

  test('shows the empty state on first load', () => {
    const { getByText } = render(<App />);
    expect(getByText(/enter a keyword/i)).toBeInTheDocument();
  });

  test('renders all filter selects', () => {
    const { getByLabelText } = render(<App />);
    expect(getByLabelText(/filter by source/i)).toBeInTheDocument();
    expect(getByLabelText(/filter by language/i)).toBeInTheDocument();
    expect(getByLabelText(/sort by/i)).toBeInTheDocument();
  });
});
