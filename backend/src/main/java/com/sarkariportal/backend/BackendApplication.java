package com.sarkariportal.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * This is the file that starts the entire backend server.
 * Run this file's main() method (or "mvn spring-boot:run") to start the API.
 *
 * @EnableScheduling is what makes ViewCountBuffer's periodic flush actually
 * run. Without it the annotation is inert, views accumulate in memory and are
 * never written -- and nothing complains, which is the worst kind of bug.
 */
@SpringBootApplication
@EnableScheduling
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

}
