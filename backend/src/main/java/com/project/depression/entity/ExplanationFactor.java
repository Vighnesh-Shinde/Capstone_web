package com.project.depression.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "explanation_factors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExplanationFactor {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id", nullable = false)
    private Report report;

    @Column(name = "feature_name", nullable = false)
    private String featureName;

    @Column(name = "contribution_score", nullable = false)
    private Double contributionScore;

    @Column(name = "description")
    private String description;

    @Column(name = "modality")
    private String modality;
}
