package com.project.depression.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends transactional email, degrading safely when SMTP isn't configured.
 *
 * Email is a real external dependency that a fresh deployment won't have on
 * day one. Rather than failing the request (which would make "forgot password"
 * look broken), an unconfigured mailer logs the message instead — so local
 * development and a not-yet-configured production both keep working, and the
 * operator can still retrieve a reset link from the logs.
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    @Value("${app.mail.from:no-reply@depression-platform.local}")
    private String fromAddress;

    @Value("${spring.mail.host:}")
    private String mailHost;

    public MailService(ObjectProvider<JavaMailSender> mailSenderProvider) {
        this.mailSenderProvider = mailSenderProvider;
    }

    public boolean isConfigured() {
        return mailHost != null && !mailHost.isBlank() && mailSenderProvider.getIfAvailable() != null;
    }

    public void send(String to, String subject, String body) {
        if (!isConfigured()) {
            log.warn("""
                    SMTP not configured — email NOT sent. Set MAIL_HOST/MAIL_PORT/MAIL_USERNAME/MAIL_PASSWORD to enable.
                    ---- would have sent ----
                    To:      {}
                    Subject: {}

                    {}
                    -------------------------""", to, subject, body);
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSenderProvider.getObject().send(message);
            log.info("Sent '{}' email to {}", subject, to);
        } catch (Exception e) {
            // Never surface SMTP internals to the caller, and never let a mail
            // failure roll back the action that triggered it.
            log.error("Failed to send '{}' email to {}", subject, to, e);
        }
    }
}
