import { useEffect, useState } from 'react';
import { jwtDecode } from "jwt-decode";

export function useAuth() {
  const [loggedUser, setLoggedUser] = useState(() => {
    const storedUser = localStorage.getItem("app-user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (error) {
        console.error("Invalid user data in localStorage:", error);
        return null;
      }
    }
    return null;
  });

  const [csrfToken, setCsrfToken] = useState("");

  // Function to fetch CSRF token
  async function fetchCsrfToken() {
    try {
      const response = await fetch("https://thegalwinapp-208f66c28985.herokuapp.com/csrf-token", { credentials: 'include' });
      if (response.ok) {
        const { csrfToken } = await response.json();
        console.log('CSRF Token fetched:', csrfToken);
        if (csrfToken) {
          setCsrfToken(csrfToken);
          document.cookie = `XSRF-TOKEN=${csrfToken}; Secure; SameSite=Strict; path=/`;
          console.log('CSRF Token stored in cookie:', csrfToken);
        }
      } else {
        console.error('Failed to fetch CSRF token:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
    }
  }

  // Function to refresh the access token
  async function refreshAccessToken(parsedUser, retries = 3) {
    try {
      const response = await fetch('https://thegalwinapp-208f66c28985.herokuapp.com/refresh-token', {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "csrf-token": csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ userId: parsedUser.userid })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          const updatedUser = { ...parsedUser, token: data.token };
          localStorage.setItem("app-user", JSON.stringify(updatedUser));
          setLoggedUser(updatedUser);
        }
      } else {
        console.error('Failed to refresh access token:', response.statusText);
        if (response.status === 403) {
          setLoggedUser(null);
          localStorage.removeItem("app-user");
        }
      }
    } catch (error) {
      console.error('Error refreshing access token:', error);
      if (retries > 0) {
        setTimeout(() => refreshAccessToken(parsedUser, retries - 1), 2000);
      } else {
        setLoggedUser(null);
        localStorage.removeItem("app-user");
      }
    }
  }

  // Function to check and create a refresh token if not present
  async function checkAndCreateRefreshToken() {
    const refreshToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('refreshToken='))
      ?.split('=')[1];

    if (!refreshToken) {
      console.log('No refresh token found in cookies, creating one...');
      const storedUser = localStorage.getItem("app-user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        await refreshAccessToken(parsedUser);
      }
    }
  }

  useEffect(() => {
    fetchCsrfToken();
    checkAndCreateRefreshToken(); // Check for refresh token on mount
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const storedUser = localStorage.getItem("app-user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        const accessToken = parsedUser?.token;

        if (accessToken) {
          const now = Math.floor(Date.now() / 1000);
          const { exp: accessTokenExp } = jwtDecode(accessToken);
          const accessTokenMinutesLeft = (accessTokenExp - now) / 60;

          if (accessTokenMinutesLeft <= 1) {
            await refreshAccessToken(parsedUser);
          }
        }
      }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval); // Cleanup on unmount
  }, [csrfToken]);

  return { loggedUser, setLoggedUser, csrfToken };
}