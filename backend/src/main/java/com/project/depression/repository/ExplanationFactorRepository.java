package com.project.depression.repository;

import com.project.depression.entity.ExplanationFactor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ExplanationFactorRepository extends JpaRepository<ExplanationFactor, UUID> {
}
