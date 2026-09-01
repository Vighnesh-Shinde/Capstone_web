package com.project.depression.controller;

import com.project.depression.dto.AdminUserResponse;
import com.project.depression.dto.PageResponse;
import com.project.depression.entity.Role;
import com.project.depression.entity.User;
import com.project.depression.repository.UserRepository;
import com.project.depression.service.AdminUserService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;
    private final UserRepository userRepository;

    public AdminUserController(AdminUserService adminUserService, UserRepository userRepository) {
        this.adminUserService = adminUserService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<PageResponse<AdminUserResponse>> list(
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(adminUserService.list(
                role, search, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))));
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<AdminUserResponse> suspend(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(adminUserService.suspend(id, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/reactivate")
    public ResponseEntity<AdminUserResponse> reactivate(@PathVariable UUID id, Authentication authentication) {
        return ResponseEntity.ok(adminUserService.reactivate(id, currentAdmin(authentication)));
    }

    @PostMapping("/{id}/reset-password")
    public ResponseEntity<Void> issuePasswordReset(@PathVariable UUID id, Authentication authentication) {
        adminUserService.issuePasswordReset(id, currentAdmin(authentication));
        return ResponseEntity.noContent().build();
    }

    private User currentAdmin(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new NoSuchElementException("Admin user not found"));
    }
}
