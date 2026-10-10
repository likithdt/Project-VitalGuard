package com.vitaguard.backend_java.security;

import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;

    public JwtAuthenticationFilter(JwtService jwtService, UserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        final String authHeader = request.getHeader("Authorization");
        final String jwt;
        final String userUid;

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        jwt = authHeader.substring(7);
        try {
            userUid = jwtService.extractUsername(jwt);
        } catch (Exception e) {
            // Token is malformed, expired or invalid. Let request proceed unauthenticated.
            filterChain.doFilter(request, response);
            return;
        }

        if (userUid != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UserDetails userDetails = this.userDetailsService.loadUserByUsername(userUid);
                if (jwtService.isTokenValid(jwt, userDetails)) {
                    // Load current User from database and verify status is ACTIVE
                    // Load current User from database and verify status is ACTIVE
                    if (userDetails instanceof User) {
                        User user = (User) userDetails;
                        String status = user.getStatus();
                        if (!"ACTIVE".equalsIgnoreCase(status)) {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json");
                            String message;
                            if ("DEACTIVATED".equalsIgnoreCase(status)) {
                                message = "Your account is currently inactive.";
                            } else if ("SUSPENDED".equalsIgnoreCase(status)) {
                                message = "Your account has been suspended. Contact system administrator.";
                            } else if ("PENDING".equalsIgnoreCase(status)) {
                                message = "Your account is waiting for administrator approval.";
                            } else if ("REJECTED".equalsIgnoreCase(status)) {
                                message = "Your account registration was rejected.";
                            } else {
                                message = "Account is not active. Access denied.";
                            }
                            response.getWriter().write("{\"error\":\"" + message + "\"}");
                            return;
                        }
                    }

                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            userDetails.getAuthorities());
                    authToken.setDetails(
                            new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            } catch (UsernameNotFoundException e) {
                // User not found in DB
            }
        }
        filterChain.doFilter(request, response);
    }
}
