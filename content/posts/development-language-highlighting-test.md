---
title: 开发语言语法高亮测试
description: 用 C、C++、Go、PHP、Python 与 Rust 示例验证博客的构建期语法高亮、语言标签和代码复制功能。
publishedAt: "2026-08-16T10:00:00+08:00"
tags:
  - Programming Languages
  - Testing
---

本文用于检查博客对常见开发语言的语法高亮支持。每段示例都包含注释、关键字、类型、函数调用、字符串和数字，方便对照颜色与语言标签。

## C

下面的 C 示例包含结构体、指针、循环和标准库函数。代码块的语言标签应显示为 **C**。

```c
#include <stdio.h>

typedef struct {
    const char *name;
    int score;
} Result;

int main(void) {
    const Result results[] = {
        {"parser", 95},
        {"renderer", 98},
    };

    for (size_t i = 0; i < sizeof(results) / sizeof(results[0]); ++i) {
        printf("%s: %d\n", results[i].name, results[i].score);
    }

    return 0;
}
```

## C++

该代码块使用常见的 `c++` fence 别名，并验证模板、范围循环、命名空间和流输出的高亮。

```c++
#include <iostream>
#include <string>
#include <vector>

template <typename T>
T sum(const std::vector<T>& values) {
    T total{};
    for (const auto& value : values) {
        total += value;
    }
    return total;
}

int main() {
    const std::vector<int> scores{95, 98, 100};
    std::cout << "total: " << sum(scores) << '\n';
    return 0;
}
```

## Go

Go 示例覆盖结构体、切片、错误返回值和格式化字符串。

```go
package main

import (
    "fmt"
    "strings"
)

type Post struct {
    Title string
    Tags  []string
}

func summary(post Post) (string, error) {
    if post.Title == "" {
        return "", fmt.Errorf("title must not be empty")
    }
    return fmt.Sprintf("%s [%s]", post.Title, strings.Join(post.Tags, ", ")), nil
}

func main() {
    text, err := summary(Post{Title: "Mesh", Tags: []string{"go", "web"}})
    if err != nil {
        panic(err)
    }
    fmt.Println(text)
}
```

## PHP

PHP 示例包含严格类型、只读构造器参数、数组映射和命名参数。

```php
<?php

declare(strict_types=1);

final class Article
{
    public function __construct(
        public readonly string $title,
        public readonly array $tags,
    ) {}

    public function label(): string
    {
        $tags = array_map(
            static fn (string $tag): string => strtoupper($tag),
            $this->tags,
        );

        return sprintf('%s [%s]', $this->title, implode(', ', $tags));
    }
}

$article = new Article(title: 'Mesh', tags: ['php', 'web']);
echo $article->label();
```

## Python

Python 示例覆盖装饰器、类型标注、列表推导式、f-string 和异常处理。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Article:
    title: str
    tags: tuple[str, ...]

    def label(self) -> str:
        normalized = [tag.upper() for tag in self.tags]
        return f"{self.title} [{', '.join(normalized)}]"


def publish(article: Article) -> None:
    if not article.title:
        raise ValueError("title must not be empty")
    print(article.label())


publish(Article(title="Mesh", tags=("python", "web")))
```

## Rust

Rust 示例覆盖枚举、模式匹配、泛型错误类型、迭代器和格式化宏。

```rust
#[derive(Debug)]
struct Article {
    title: String,
    tags: Vec<String>,
}

fn label(article: &Article) -> Result<String, &'static str> {
    if article.title.is_empty() {
        return Err("title must not be empty");
    }

    let tags = article
        .tags
        .iter()
        .map(|tag| tag.to_uppercase())
        .collect::<Vec<_>>()
        .join(", ");

    Ok(format!("{} [{}]", article.title, tags))
}

fn main() {
    let article = Article {
        title: "Mesh".to_owned(),
        tags: vec!["rust".to_owned(), "web".to_owned()],
    };

    match label(&article) {
        Ok(text) => println!("{text}"),
        Err(message) => eprintln!("error: {message}"),
    }
}
```

## 验收清单

- C、C++、Go、PHP、Python、Rust 代码块均显示对应语言标签；
- 注释、关键字、字符串、数字、类型和函数名具有可辨识的颜色差异；
- C++ 的 `c++` fence 能正确归一化为 C++；
- 每个代码块都显示复制按钮，复制结果不包含语言标签；
- 在窄屏中，长代码行只在代码块内部横向滚动，页面本身不溢出。
